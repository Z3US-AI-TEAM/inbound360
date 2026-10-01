-- Vínculo automático pelo e-mail: o convite (Configurações → Usuários) e a identidade externa
-- prometem "ao criar a conta com esse e-mail, o acesso entra sozinho". Esta migration cumpre a promessa:
-- no cadastro, convites pendentes viram membership e identidades externas ganham user_id;
-- convite ou identidade criados para quem já tem conta ligam na hora.
create or replace function app.link_by_email(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare p public.profiles; n int := 0; r record;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null then return 0; end if;
  for r in
    select i.* from public.invites i
    where lower(i.email) = lower(p.email) and i.accepted_at is null and i.expires_at > now()
  loop
    insert into public.memberships (tenant_id, user_id, role, status, invited_by)
    values (r.tenant_id, p.id, r.role, 'active', r.invited_by)
    on conflict (tenant_id, user_id) do update set role = excluded.role, status = 'active';
    update public.invites set accepted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  for r in
    select e.* from public.external_identities e
    where lower(e.email) = lower(p.email) and e.status = 'active' and e.user_id is null
  loop
    update public.external_identities set user_id = p.id where id = r.id;
    insert into public.memberships (tenant_id, user_id, role, status)
    values (r.tenant_id, p.id, 'external', 'active')
    on conflict (tenant_id, user_id) do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function app.link_by_email(uuid) from public, anon, authenticated;

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if app.is_personal_email(new.email) then
    raise exception 'E-mail pessoal não é aceito. Use o e-mail da sua empresa.' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  perform app.apply_bootstrap(new.id);
  perform app.link_by_email(new.id);
  return new;
end $$;

-- Convite ou identidade externa para quem já tem conta: liga na hora
create or replace function app.autolink_existing_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  select id into u from public.profiles where lower(email) = lower(new.email);
  if u is not null then perform app.link_by_email(u); end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'invites_autolink') then
    create trigger invites_autolink after insert on public.invites
      for each row execute function app.autolink_existing_user();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'external_identities_autolink') then
    create trigger external_identities_autolink after insert on public.external_identities
      for each row execute function app.autolink_existing_user();
  end if;
end $$;
