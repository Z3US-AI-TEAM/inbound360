-- Wrappers em public para o cliente (PostgREST só expõe o schema public)
create or replace function public.access_state(t uuid) returns jsonb language sql stable security definer set search_path = public as $$ select app.access_state(t) $$;
create or replace function public.touch_presence(t uuid) returns void language sql security definer set search_path = public as $$ select app.touch_presence(t) $$;
create or replace function public.accept_invite(p_token text) returns uuid language sql security definer set search_path = public as $$ select app.accept_invite(p_token) $$;
create or replace function public.grant_membership(p_email text, p_slug text, p_role text) returns void language sql security definer set search_path = public as $$ select app.grant_membership(p_email, p_slug, p_role) $$;
create or replace function public.my_role(t uuid) returns text language sql stable security definer set search_path = public as $$ select app.tenant_role(t) $$;

-- Reset dos dados de demonstração (só admin do tenant demo ou da plataforma)
create or replace function public.reset_demo(p_slug text default 'pg') returns text language plpgsql security definer set search_path = public as $$
declare t uuid; d boolean;
begin
  select id, demo into t, d from public.tenants where slug = p_slug;
  if t is null then raise exception 'Tenant não existe'; end if;
  if not d then raise exception 'Este tenant não é de demonstração'; end if;
  if not app.is_tenant_admin(t) then raise exception 'Sem permissão'; end if;
  return app.ib_seed_demo(p_slug);
end $$;

-- Marcar inadimplência (danger zone): admin da plataforma, ou admin do tenant em tenant demo
create or replace function public.set_billing_status(p_tenant uuid, p_status text, p_overdue_since date default null) returns void
language plpgsql security definer set search_path = public as $$
declare d boolean;
begin
  select demo into d from public.tenants where id = p_tenant;
  if not (app.is_platform_admin() or (d and app.is_tenant_admin(p_tenant))) then raise exception 'Sem permissão'; end if;
  insert into public.billing_accounts (tenant_id, status, overdue_since) values (p_tenant, p_status, p_overdue_since)
  on conflict (tenant_id) do update set status = excluded.status, overdue_since = excluded.overdue_since, updated_at = now();
end $$;

-- Engajamento agregado (admin do tenant)
create or replace function public.engagement_summary(p_tenant uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not app.is_tenant_admin(p_tenant) then raise exception 'Sem permissão'; end if;
  select jsonb_build_object(
    'users', (select jsonb_agg(x) from (
        select p.email, p.full_name, m.role, count(*) filter (where e.event = 'page_view') as views,
               count(distinct e.session_id) as sessions, coalesce(sum(e.duration_ms), 0) / 60000 as minutes, max(e.created_at) as last_at
        from public.memberships m join public.profiles p on p.id = m.user_id
        left join public.engagement_events e on e.user_id = m.user_id and e.tenant_id = m.tenant_id and e.created_at > now() - make_interval(days => p_days)
        where m.tenant_id = p_tenant group by p.email, p.full_name, m.role order by views desc) x),
    'paths', (select jsonb_agg(x) from (
        select path, count(*) as views, coalesce(sum(duration_ms), 0) / 60000 as minutes
        from public.engagement_events where tenant_id = p_tenant and event = 'page_view' and created_at > now() - make_interval(days => p_days)
        group by path order by views desc limit 20) x),
    'days', (select jsonb_agg(x) from (
        select to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as day, count(*) filter (where event = 'page_view') as views, count(distinct user_id) as users
        from public.engagement_events where tenant_id = p_tenant and created_at > now() - make_interval(days => p_days)
        group by 1 order by 1) x)
  ) into r;
  return r;
end $$;

grant execute on function public.access_state(uuid), public.touch_presence(uuid), public.accept_invite(text), public.grant_membership(text,text,text),
  public.my_role(uuid), public.reset_demo(text), public.set_billing_status(uuid,text,date), public.engagement_summary(uuid,int) to authenticated;
