-- =====================================================================
-- Produto em inbound.z3us.app: cliente = tenant; unidades (plantas) com
-- suas portarias; acesso por unidade; billing por unidade e portaria.
-- =====================================================================

-- Portarias por unidade
create table if not exists public.ib_gates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid not null references public.ib_plants(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  active boolean not null default true,
  sort int not null default 100,
  unique (plant_id, code)
);
alter table public.ib_gate_events add column if not exists gate_id uuid references public.ib_gates(id) on delete set null;
alter table public.ib_purchase_orders add column if not exists plant_id uuid references public.ib_plants(id) on delete set null;
alter table public.ib_releases add column if not exists plant_id uuid references public.ib_plants(id) on delete set null;
create index if not exists ib_po_plant_idx on public.ib_purchase_orders(tenant_id, plant_id);

-- Acesso por unidade: vazio = todas as unidades do tenant
alter table public.memberships add column if not exists plant_ids uuid[] not null default '{}';

create or replace function app.plant_allowed(t uuid, p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select app.is_platform_admin() or exists (
    select 1 from public.memberships m where m.tenant_id = t and m.user_id = auth.uid() and m.status = 'active'
      and (cardinality(m.plant_ids) = 0 or p is null or p = any(m.plant_ids)));
$$;
grant execute on function app.plant_allowed(uuid, uuid) to authenticated;

-- Reforça as policies de leitura das tabelas operacionais com a unidade
drop policy if exists ib_appt_sel on public.ib_appointments;
create policy ib_appt_sel on public.ib_appointments for select to authenticated
  using (app.has_tenant(tenant_id) and app.plant_allowed(tenant_id, plant_id)
         and (app.tenant_role(tenant_id) <> 'external' or supplier_id in (select app.my_external_entities(tenant_id))));
drop policy if exists ib_gate_sel on public.ib_gate_events;
create policy ib_gate_sel on public.ib_gate_events for select to authenticated using (app.has_tenant(tenant_id) and app.plant_allowed(tenant_id, plant_id));
drop policy if exists ib_yard_sel on public.ib_yard_spots;
create policy ib_yard_sel on public.ib_yard_spots for select to authenticated using (app.has_tenant(tenant_id) and app.plant_allowed(tenant_id, plant_id));
drop policy if exists ib_plants_sel on public.ib_plants;
create policy ib_plants_sel on public.ib_plants for select to authenticated using (app.has_tenant(tenant_id) and app.plant_allowed(tenant_id, id));

alter table public.ib_gates enable row level security;
create policy ib_gates_sel on public.ib_gates for select to authenticated using (app.has_tenant(tenant_id) and app.plant_allowed(tenant_id, plant_id));
create policy ib_gates_wr on public.ib_gates for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));

-- Billing por unidade e portaria (o preço vem da Tabela; aqui só a contagem e o valor unitário informado pelo financeiro)
create table if not exists public.billing_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid references public.ib_plants(id) on delete cascade,
  kind text not null check (kind in ('plataforma','unidade','portaria','usuario','modulo')),
  description text not null,
  qty int not null default 1,
  unit_price_cents bigint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.billing_items enable row level security;
create policy billing_items_sel on public.billing_items for select to authenticated using (app.is_tenant_admin(tenant_id));
create policy billing_items_wr on public.billing_items for all to authenticated using (app.is_platform_admin()) with check (app.is_platform_admin());

-- Resumo de billing por unidade (para a tela e para a fatura)
create or replace view public.billing_summary_v with (security_invoker = true) as
select b.tenant_id, b.plant_id, p.name as plant_name, b.kind, b.description, b.qty, b.unit_price_cents, b.qty * b.unit_price_cents as total_cents
from public.billing_items b left join public.ib_plants p on p.id = b.plant_id where b.active;

-- Tenants do usuário logado (para o seletor depois do login)
create or replace function public.my_tenants() returns table(id uuid, slug text, name text, product_name text, brand_mode text, accent_color text, logo_url text, demo boolean, role text)
language sql stable security definer set search_path = public as $$
  select t.id, t.slug, t.name, t.product_name, t.brand_mode, t.accent_color, t.logo_url, t.demo, m.role
  from public.tenants t join public.memberships m on m.tenant_id = t.id
  where m.user_id = auth.uid() and m.status = 'active' and t.status in ('trial','active','suspended')
  union
  select t.id, t.slug, t.name, t.product_name, t.brand_mode, t.accent_color, t.logo_url, t.demo, 'tenant_admin'
  from public.tenants t where app.is_platform_admin() and t.status in ('trial','active','suspended')
  order by 3;
$$;
grant execute on function public.my_tenants() to authenticated;

-- A view de agendamentos ganha a unidade
create or replace view public.ib_appointments_v with (security_invoker = true) as
select a.*, d.code as dock_code, d.name as dock_name, d.kind as dock_kind,
       s.code as supplier_code, s.name as supplier_name, s.short_name as supplier_short, s.is_broker, s.punctuality,
       lt.code as load_type_code, lt.name as load_type_name, lt.duration_min, lt.vehicle,
       po.po_number, po.material, po.quantity, po.origin, po.coverage_days, po.free_time_until, po.due_date,
       pl.code as plant_code, pl.name as plant_name
from public.ib_appointments a
left join public.ib_docks d on d.id = a.dock_id
join public.ib_suppliers s on s.id = a.supplier_id
join public.ib_load_types lt on lt.id = a.load_type_id
left join public.ib_purchase_orders po on po.id = a.po_id
join public.ib_plants pl on pl.id = a.plant_id;
