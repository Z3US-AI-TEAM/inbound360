-- =====================================================================
-- Z3US Plataforma · núcleo comum (tenants, acesso, billing, engajamento,
-- danger zone, chamados, FAQ, guias). Vale para toda solução Z3US.
-- Convenção: tabelas do núcleo sem prefixo; tabelas de solução com prefixo.
-- RLS ligado em tudo desde a primeira migração.
-- =====================================================================
create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  legal_name text,
  solution text not null default 'inbound360',
  brand_mode text not null default 'z3us' check (brand_mode in ('z3us','white')),
  product_name text not null default 'Inbound 360',
  accent_color text,                       -- white label: cor de acento (hex)
  logo_url text,                           -- white label: logo do cliente (arquivo oficial)
  email_domains text[] not null default '{}',  -- domínios corporativos permitidos
  status text not null default 'active' check (status in ('trial','active','suspended','closed')),
  demo boolean not null default false,     -- tenant de demonstração (dados fictícios)
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Perfis (espelho de auth.users) e membros por tenant
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  is_platform_admin boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('tenant_admin','operator','viewer','external')),
  status text not null default 'active' check (status in ('invited','active','disabled')),
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('tenant_admin','operator','viewer','external')),
  token text not null default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references public.profiles(id),
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

-- Identidade externa (fornecedor, parceiro): expira por inatividade e pode ser revogada
create table if not exists public.external_identities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'supplier' check (kind in ('supplier','broker','carrier','partner')),
  entity_id uuid,                          -- id na tabela da solução (ex.: ib_suppliers)
  email text not null,
  name text,
  status text not null default 'active' check (status in ('active','revoked','expired')),
  inactivity_days int not null default 60,
  last_access_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

-- ---------------------------------------------------------------------
-- Configurações do tenant (identidade, parâmetros, danger zone)
-- ---------------------------------------------------------------------
create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  identity jsonb not null default '{}'::jsonb,   -- favicon, og_title, og_description, og_image, login_art
  params jsonb not null default '{}'::jsonb,     -- parâmetros da solução
  danger jsonb not null default '{"warn_days":3,"bar_days":7,"block_days":15}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Billing e danger zone
-- ---------------------------------------------------------------------
create table if not exists public.billing_accounts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan text not null default 'assinatura',
  amount_cents bigint not null default 0,
  currency text not null default 'BRL',
  period text not null default 'monthly' check (period in ('monthly','quarterly','yearly')),
  closing_day int not null default 30 check (closing_day between 1 and 31),
  report_to_email text,
  status text not null default 'ok' check (status in ('ok','overdue','blocked')),
  overdue_since date,
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_cents bigint not null,
  due_date date not null,
  status text not null default 'draft' check (status in ('draft','sent','paid','overdue','void')),
  paid_at timestamptz,
  external_ref text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Engajamento e auditoria
-- ---------------------------------------------------------------------
create table if not exists public.engagement_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  session_id text,
  event text not null check (event in ('login','logout','page_view','action','heartbeat')),
  path text,
  meta jsonb not null default '{}'::jsonb,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index if not exists engagement_tenant_time_idx on public.engagement_events(tenant_id, created_at desc);
create index if not exists engagement_user_idx on public.engagement_events(user_id, created_at desc);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_tenant_idx on public.audit_log(tenant_id, created_at desc);

-- ---------------------------------------------------------------------
-- Chamados, FAQ e guias
-- ---------------------------------------------------------------------
create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,   -- null = biblioteca comum Z3US
  solution text not null default 'core',
  question text not null,
  answer text not null,
  tags text[] not null default '{}',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  number bigint generated always as identity,
  opened_by uuid references public.profiles(id) on delete set null,
  title text not null,
  body text,
  category text not null default 'duvida' check (category in ('duvida','erro','acesso','dado','melhoria','financeiro')),
  priority text not null default 'normal' check (priority in ('baixa','normal','alta','critica')),
  status text not null default 'open' check (status in ('open','answered','escalated','closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  faq_match uuid references public.faq_items(id) on delete set null,
  escalated_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('comment','status','escalation','report')),
  body text,
  created_at timestamptz not null default now()
);

create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  solution text not null default 'core',
  route text not null,
  title text not null,
  body_md text not null,
  sort int not null default 100,
  updated_at timestamptz not null default now(),
  unique (solution, route)
);

-- Fila de notificações (o Edge Function "notify" envia pelo Resend e registra)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  to_email text not null,
  template text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- ---------------------------------------------------------------------
-- Funções de apoio (security definer, search_path fixo)
-- ---------------------------------------------------------------------
create or replace function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_platform_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function app.tenant_role(t uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.memberships m
  where m.tenant_id = t and m.user_id = auth.uid() and m.status = 'active' limit 1;
$$;

create or replace function app.has_tenant(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_platform_admin() or exists (
    select 1 from public.memberships m where m.tenant_id = t and m.user_id = auth.uid() and m.status = 'active');
$$;

create or replace function app.can_write(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_platform_admin() or coalesce(app.tenant_role(t) in ('tenant_admin','operator'), false);
$$;

create or replace function app.is_tenant_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_platform_admin() or coalesce(app.tenant_role(t) = 'tenant_admin', false);
$$;

create or replace function app.my_tenants() returns setof uuid
language sql stable security definer set search_path = public as $$
  select m.tenant_id from public.memberships m where m.user_id = auth.uid() and m.status = 'active';
$$;

-- Entidades externas (ex.: fornecedores) às quais o usuário logado está vinculado
create or replace function app.my_external_entities(t uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select e.entity_id from public.external_identities e
  where e.tenant_id = t and e.user_id = auth.uid() and e.status = 'active' and e.entity_id is not null;
$$;

-- Domínios pessoais bloqueados (governança: só e-mail corporativo)
create or replace function app.is_personal_email(e text) returns boolean
language sql immutable as $$
  select lower(split_part(e, '@', 2)) = any (array[
    'gmail.com','googlemail.com','hotmail.com','hotmail.com.br','outlook.com','outlook.com.br','live.com',
    'yahoo.com','yahoo.com.br','icloud.com','me.com','uol.com.br','bol.com.br','terra.com.br','ig.com.br',
    'protonmail.com','proton.me','aol.com','msn.com','globo.com','zipmail.com.br']);
$$;

-- Estado de acesso do tenant para a danger zone (ok, warn, bar, blocked)
create or replace function app.access_state(t uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b public.billing_accounts; s public.tenant_settings; tn public.tenants;
  d int; warn int; bar int; block int; mode text := 'ok';
begin
  select * into tn from public.tenants where id = t;
  if tn.status in ('suspended','closed') then
    return jsonb_build_object('mode','blocked','reason',tn.status,'days',null);
  end if;
  select * into b from public.billing_accounts where tenant_id = t;
  select * into s from public.tenant_settings where tenant_id = t;
  if b.tenant_id is null or b.status = 'ok' or b.overdue_since is null then
    return jsonb_build_object('mode','ok','days',0);
  end if;
  d := current_date - b.overdue_since;
  warn := coalesce((s.danger->>'warn_days')::int, 3);
  bar := coalesce((s.danger->>'bar_days')::int, 7);
  block := coalesce((s.danger->>'block_days')::int, 15);
  if b.status = 'blocked' or d >= block then mode := 'blocked';
  elsif d >= bar then mode := 'bar';
  elsif d >= warn then mode := 'warn';
  end if;
  return jsonb_build_object('mode', mode, 'days', d, 'warn_days', warn, 'bar_days', bar, 'block_days', block, 'overdue_since', b.overdue_since);
end $$;

-- Perfil criado automaticamente no cadastro; bloqueio de e-mail pessoal no servidor
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if app.is_personal_email(new.email) then
    raise exception 'E-mail pessoal não é aceito. Use o e-mail da sua empresa.' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- Aceite de convite: liga o usuário logado ao tenant com o papel do convite
create or replace function app.accept_invite(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare i public.invites; me uuid := auth.uid(); my_email text;
begin
  if me is null then raise exception 'Não autenticado'; end if;
  select email into my_email from public.profiles where id = me;
  select * into i from public.invites where token = p_token and accepted_at is null and expires_at > now();
  if i.id is null then raise exception 'Convite inválido ou expirado'; end if;
  if lower(i.email) <> lower(my_email) then raise exception 'Este convite foi emitido para outro e-mail'; end if;
  insert into public.memberships (tenant_id, user_id, role, status, invited_by)
  values (i.tenant_id, me, i.role, 'active', i.invited_by)
  on conflict (tenant_id, user_id) do update set role = excluded.role, status = 'active';
  update public.invites set accepted_at = now() where id = i.id;
  return i.tenant_id;
end $$;

-- Expira identidades externas por inatividade (rodar por cron diário)
create or replace function app.expire_external_identities() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with x as (
    update public.external_identities e
       set status = 'expired'
     where e.status = 'active'
       and coalesce(e.last_access_at, e.created_at) < now() - make_interval(days => e.inactivity_days)
    returning e.user_id, e.tenant_id)
  update public.memberships m set status = 'disabled'
    from x where m.user_id = x.user_id and m.tenant_id = x.tenant_id and m.role = 'external';
  get diagnostics n = row_count;
  return n;
end $$;

-- Heartbeat: atualiza last_seen e last_access da identidade externa
create or replace function app.touch_presence(t uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set last_seen_at = now() where id = auth.uid();
  update public.external_identities set last_access_at = now() where user_id = auth.uid() and tenant_id = t and status = 'active';
end $$;

create or replace function app.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger tickets_updated before update on public.tickets for each row execute function app.set_updated_at();
create trigger faq_updated before update on public.faq_items for each row execute function app.set_updated_at();
create trigger settings_updated before update on public.tenant_settings for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.external_identities enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.billing_accounts enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.engagement_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.faq_items enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_events enable row level security;
alter table public.guides enable row level security;
alter table public.notifications enable row level security;

-- tenants: membros leem; só admin do tenant ou da plataforma edita marca e parâmetros
create policy tenants_select on public.tenants for select to authenticated using (app.has_tenant(id));
create policy tenants_update on public.tenants for update to authenticated using (app.is_tenant_admin(id)) with check (app.is_tenant_admin(id));
create policy tenants_insert on public.tenants for insert to authenticated with check (app.is_platform_admin());
-- login público precisa ler a marca do tenant pelo slug (sem dados sensíveis): view abaixo

-- profiles: o próprio, colegas do mesmo tenant e admin da plataforma
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or app.is_platform_admin() or exists (
    select 1 from public.memberships a join public.memberships b on a.tenant_id = b.tenant_id
    where a.user_id = auth.uid() and b.user_id = profiles.id and a.status = 'active'));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and is_platform_admin = (select p.is_platform_admin from public.profiles p where p.id = auth.uid()));

-- memberships: membros veem os membros do tenant; admin do tenant gerencia
create policy memberships_select on public.memberships for select to authenticated using (app.has_tenant(tenant_id));
create policy memberships_write on public.memberships for all to authenticated using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

create policy invites_all on public.invites for all to authenticated using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

create policy ext_select on public.external_identities for select to authenticated using (app.has_tenant(tenant_id) or user_id = auth.uid());
create policy ext_write on public.external_identities for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));

create policy settings_select on public.tenant_settings for select to authenticated using (app.has_tenant(tenant_id));
create policy settings_write on public.tenant_settings for all to authenticated using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));

create policy billing_select on public.billing_accounts for select to authenticated using (app.is_tenant_admin(tenant_id));
create policy billing_write on public.billing_accounts for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());
create policy invoices_select on public.billing_invoices for select to authenticated using (app.is_tenant_admin(tenant_id));
create policy invoices_write on public.billing_invoices for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

-- engajamento: qualquer membro grava os próprios eventos; admin do tenant lê
create policy engagement_insert on public.engagement_events for insert to authenticated
  with check (app.has_tenant(tenant_id) and (user_id is null or user_id = auth.uid()));
create policy engagement_select on public.engagement_events for select to authenticated using (app.is_tenant_admin(tenant_id));

create policy audit_select on public.audit_log for select to authenticated using (app.is_tenant_admin(tenant_id));
create policy audit_insert on public.audit_log for insert to authenticated with check (app.has_tenant(tenant_id) and actor_id = auth.uid());

-- FAQ: comum (tenant_id null) publicada é visível a todos os autenticados; do tenant, aos membros
create policy faq_select on public.faq_items for select to authenticated
  using (published and (tenant_id is null or app.has_tenant(tenant_id)));
create policy faq_write on public.faq_items for all to authenticated
  using ((tenant_id is null and app.is_platform_admin()) or (tenant_id is not null and app.is_tenant_admin(tenant_id)))
  with check ((tenant_id is null and app.is_platform_admin()) or (tenant_id is not null and app.is_tenant_admin(tenant_id)));

-- chamados: quem abriu vê o próprio; admin e operador do tenant veem todos
create policy tickets_select on public.tickets for select to authenticated
  using (opened_by = auth.uid() or app.can_write(tenant_id));
create policy tickets_insert on public.tickets for insert to authenticated
  with check (app.has_tenant(tenant_id) and opened_by = auth.uid());
create policy tickets_update on public.tickets for update to authenticated
  using (opened_by = auth.uid() or app.can_write(tenant_id)) with check (opened_by = auth.uid() or app.can_write(tenant_id));
create policy ticket_events_select on public.ticket_events for select to authenticated
  using (exists (select 1 from public.tickets t where t.id = ticket_id and (t.opened_by = auth.uid() or app.can_write(t.tenant_id))));
create policy ticket_events_insert on public.ticket_events for insert to authenticated
  with check (actor_id = auth.uid() and exists (select 1 from public.tickets t where t.id = ticket_id and (t.opened_by = auth.uid() or app.can_write(t.tenant_id))));

create policy guides_select on public.guides for select to authenticated using (true);
create policy guides_write on public.guides for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

create policy notifications_select on public.notifications for select to authenticated using (tenant_id is not null and app.is_tenant_admin(tenant_id));
-- inserção só pelo service role (Edge Functions); nenhuma policy de insert para authenticated

-- Marca pública do tenant para a tela de login (sem dados sensíveis)
create or replace view public.tenant_public with (security_invoker = false) as
  select slug, name, product_name, brand_mode, accent_color, logo_url, demo,
         (select identity from public.tenant_settings s where s.tenant_id = t.id) as identity
  from public.tenants t where status in ('trial','active','suspended');
grant select on public.tenant_public to anon, authenticated;

grant execute on function app.is_platform_admin(), app.tenant_role(uuid), app.has_tenant(uuid), app.can_write(uuid),
  app.is_tenant_admin(uuid), app.my_tenants(), app.my_external_entities(uuid), app.is_personal_email(text),
  app.access_state(uuid), app.accept_invite(text), app.touch_presence(uuid) to authenticated;
grant execute on function app.is_personal_email(text) to anon;
