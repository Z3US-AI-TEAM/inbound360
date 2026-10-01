-- =====================================================================
-- Gestão Z3US: área do admin da plataforma (lista de tenants, criação de
-- tenant com unidade, portarias, billing e primeiro admin; status).
-- Tudo security definer, barrado por app.is_platform_admin().
-- =====================================================================

-- Lista de tenants com os números que a tela precisa
create or replace function public.platform_tenants() returns table(
  id uuid, slug text, name text, legal_name text, solution text, product_name text, brand_mode text,
  status text, demo boolean, created_at timestamptz,
  plants int, gates int, members int, invites_pending int,
  billing_status text, billing_amount_cents bigint, billing_overdue_since date, last_activity_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.id, t.slug, t.name, t.legal_name, t.solution, t.product_name, t.brand_mode, t.status, t.demo, t.created_at,
    (select count(*)::int from public.ib_plants p where p.tenant_id = t.id),
    (select count(*)::int from public.ib_gates g where g.tenant_id = t.id and g.active),
    (select count(*)::int from public.memberships m where m.tenant_id = t.id and m.status = 'active'),
    (select count(*)::int from public.invites i where i.tenant_id = t.id and i.accepted_at is null and i.expires_at > now()),
    b.status, b.amount_cents, b.overdue_since,
    (select max(e.created_at) from public.engagement_events e where e.tenant_id = t.id)
  from public.tenants t
  left join public.billing_accounts b on b.tenant_id = t.id
  where app.is_platform_admin()
  order by (t.status = 'closed'), t.name;
$$;
revoke execute on function public.platform_tenants() from public, anon;
grant execute on function public.platform_tenants() to authenticated;

-- Criação de tenant em uma transação: tenant, settings, billing, primeira unidade com portarias,
-- itens de billing e convite do primeiro administrador (liga sozinho no cadastro).
create or replace function public.create_tenant(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t uuid; pl uuid; inv uuid; g jsonb; it jsonb; n_gates int := 0; n_items int := 0;
  v_slug text := lower(trim(coalesce(p->>'slug', '')));
  v_name text := trim(coalesce(p->>'name', ''));
  v_admin text := lower(trim(coalesce(p->>'admin_email', '')));
  v_status text := coalesce(nullif(p->>'status', ''), 'trial');
  v_domains text[];
begin
  if not app.is_platform_admin() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if v_name = '' then raise exception 'Nome do cliente é obrigatório'; end if;
  if v_slug !~ '^[a-z0-9-]{2,40}$' then raise exception 'Slug inválido: letras minúsculas, números e hífen, de 2 a 40 caracteres'; end if;
  if exists (select 1 from public.tenants where slug = v_slug) then raise exception 'Já existe um tenant com o slug %', v_slug; end if;
  if v_status not in ('trial', 'active') then raise exception 'Status inicial precisa ser trial ou active'; end if;
  select coalesce(array_agg(lower(trim(x))) filter (where trim(x) <> ''), '{}'::text[]) into v_domains
    from jsonb_array_elements_text(coalesce(p->'email_domains', '[]'::jsonb)) x;
  if v_admin <> '' then
    if v_admin !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'E-mail do administrador inválido'; end if;
    if app.is_personal_email(v_admin) then raise exception 'E-mail pessoal não é aceito para o administrador'; end if;
  end if;

  insert into public.tenants (slug, name, legal_name, solution, brand_mode, product_name, accent_color, logo_url, email_domains, status, demo)
  values (v_slug, v_name, nullif(trim(coalesce(p->>'legal_name', '')), ''), coalesce(nullif(p->>'solution', ''), 'inbound360'),
          coalesce(nullif(p->>'brand_mode', ''), 'z3us'), coalesce(nullif(trim(coalesce(p->>'product_name', '')), ''), 'Inbound 360'),
          nullif(trim(coalesce(p->>'accent_color', '')), ''), nullif(trim(coalesce(p->>'logo_url', '')), ''), v_domains, v_status,
          coalesce((p->>'demo')::boolean, false))
  returning id into t;

  insert into public.tenant_settings (tenant_id, identity, params, danger)
  values (t, coalesce(p->'identity', '{}'::jsonb), '{}'::jsonb, coalesce(p->'danger', '{"warn_days":3,"bar_days":7,"block_days":15}'::jsonb));

  insert into public.billing_accounts (tenant_id, plan, amount_cents, currency, period, closing_day, report_to_email)
  values (t, coalesce(nullif(p#>>'{billing,plan}', ''), 'assinatura'), coalesce((p#>>'{billing,amount_cents}')::bigint, 0), 'BRL',
          coalesce(nullif(p#>>'{billing,period}', ''), 'monthly'), coalesce((p#>>'{billing,closing_day}')::int, 30),
          nullif(trim(coalesce(p#>>'{billing,report_to_email}', '')), ''));

  if nullif(trim(coalesce(p#>>'{plant,code}', '')), '') is not null then
    insert into public.ib_plants (tenant_id, code, name, address, open_time, close_time)
    values (t, upper(trim(p#>>'{plant,code}')), coalesce(nullif(trim(coalesce(p#>>'{plant,name}', '')), ''), upper(trim(p#>>'{plant,code}'))),
            nullif(trim(coalesce(p#>>'{plant,address}', '')), ''),
            coalesce(nullif(p#>>'{plant,open_time}', '')::time, '06:00'::time), coalesce(nullif(p#>>'{plant,close_time}', '')::time, '22:00'::time))
    returning id into pl;
    for g in select * from jsonb_array_elements(coalesce(p#>'{plant,gates}', '[]'::jsonb)) loop
      if nullif(trim(coalesce(g->>'code', '')), '') is not null then
        insert into public.ib_gates (tenant_id, plant_id, code, name, sort)
        values (t, pl, upper(trim(g->>'code')), coalesce(nullif(trim(coalesce(g->>'name', '')), ''), 'Portaria ' || upper(trim(g->>'code'))), 100 + n_gates);
        n_gates := n_gates + 1;
      end if;
    end loop;
  end if;

  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    if (it->>'kind') not in ('plataforma', 'unidade', 'portaria', 'usuario', 'modulo') then
      raise exception 'Item de billing com tipo inválido: %', it->>'kind';
    end if;
    insert into public.billing_items (tenant_id, plant_id, kind, description, qty, unit_price_cents)
    values (t, case when (it->>'kind') in ('unidade', 'portaria') then pl else null end, it->>'kind',
            coalesce(nullif(trim(coalesce(it->>'description', '')), ''), it->>'kind'), greatest(coalesce((it->>'qty')::int, 1), 0),
            greatest(coalesce((it->>'unit_price_cents')::bigint, 0), 0));
    n_items := n_items + 1;
  end loop;

  if v_admin <> '' then
    insert into public.invites (tenant_id, email, role, invited_by, expires_at)
    values (t, v_admin, 'tenant_admin', auth.uid(), now() + interval '30 days')
    returning id into inv;
  end if;

  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, after)
  values (t, auth.uid(), 'tenant.create', 'tenants', t::text,
          jsonb_build_object('slug', v_slug, 'name', v_name, 'status', v_status, 'plant_id', pl, 'gates', n_gates, 'items', n_items, 'admin_email', nullif(v_admin, '')));

  return jsonb_build_object('tenant_id', t, 'slug', v_slug, 'plant_id', pl, 'gates', n_gates, 'items', n_items, 'invite_id', inv);
end $$;
revoke execute on function public.create_tenant(jsonb) from public, anon;
grant execute on function public.create_tenant(jsonb) to authenticated;

-- Status do tenant (trial, active, suspended, closed) com trilha de auditoria
create or replace function public.set_tenant_status(p_tenant uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not app.is_platform_admin() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  if p_status not in ('trial', 'active', 'suspended', 'closed') then raise exception 'Status inválido: %', p_status; end if;
  select status into old from public.tenants where id = p_tenant;
  if old is null then raise exception 'Tenant não existe'; end if;
  update public.tenants set status = p_status where id = p_tenant;
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, before, after)
  values (p_tenant, auth.uid(), 'tenant.status', 'tenants', p_tenant::text, jsonb_build_object('status', old), jsonb_build_object('status', p_status));
end $$;
revoke execute on function public.set_tenant_status(uuid, text) from public, anon;
grant execute on function public.set_tenant_status(uuid, text) to authenticated;
