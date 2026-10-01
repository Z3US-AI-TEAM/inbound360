-- Bootstrap do primeiro acesso: quem está nesta lista entra como admin da plataforma
-- e já ganha vínculo com o tenant indicado no momento do cadastro (sem convite).
-- A lista é interna (schema app); só o postgres escreve nela.
create table if not exists app.bootstrap_admins (
  email text primary key,
  tenant_slug text,
  role text not null default 'tenant_admin' check (role in ('tenant_admin','operator','viewer')),
  platform boolean not null default true,
  note text
);
revoke all on app.bootstrap_admins from public, anon, authenticated;

insert into app.bootstrap_admins (email, tenant_slug, role, platform, note)
values ('herbert@z3us.ai', 'pg', 'tenant_admin', true, 'CEO Z3US.AI')
on conflict (email) do nothing;

-- Aplica o bootstrap a um perfil já existente (idempotente); o trigger chama no cadastro.
create or replace function app.apply_bootstrap(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.profiles; b app.bootstrap_admins; t uuid;
begin
  select * into p from public.profiles where id = p_user;
  if p.id is null then return false; end if;
  select * into b from app.bootstrap_admins where lower(email) = lower(p.email);
  if b.email is null then return false; end if;
  if b.platform then
    update public.profiles set is_platform_admin = true where id = p.id and not is_platform_admin;
  end if;
  if b.tenant_slug is not null then
    select id into t from public.tenants where slug = b.tenant_slug;
    if t is not null then
      insert into public.memberships (tenant_id, user_id, role, status)
      values (t, p.id, b.role, 'active')
      on conflict (tenant_id, user_id) do update set role = excluded.role, status = 'active';
    end if;
  end if;
  return true;
end $$;
revoke execute on function app.apply_bootstrap(uuid) from public, anon, authenticated;

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
  return new;
end $$;
