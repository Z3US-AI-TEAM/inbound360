-- =====================================================================
-- Inbound 360 · esteira de inbound (docas, gate e pátio)
-- Todas as tabelas carregam tenant_id para RLS simples e rápida.
-- =====================================================================

create table if not exists public.ib_plants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  address text,
  timezone text not null default 'America/Sao_Paulo',
  open_time time not null default '06:00',
  close_time time not null default '22:00',
  slot_minutes int not null default 15,
  no_show_minutes int not null default 30,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.ib_docks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid not null references public.ib_plants(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null check (kind in ('paletizada','manual','conteiner')),
  active boolean not null default true,
  sort int not null default 100,
  unique (plant_id, code)
);

create table if not exists public.ib_load_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid not null references public.ib_plants(id) on delete cascade,
  code text not null,
  name text not null,
  duration_min int not null,
  vehicle text not null,
  handling text not null check (handling in ('paletizada','manual','conteiner')),
  supplier_can_book boolean not null default true,
  unique (plant_id, code)
);

create table if not exists public.ib_suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  short_name text,
  city text,
  distance_note text,
  is_broker boolean not null default false,
  email_domains text[] not null default '{}',
  contact_name text,
  contact_phone text,
  max_windows_per_day int not null default 2,
  min_lead_hours int not null default 24,
  cutoff_time time not null default '16:00',
  punctuality int,                          -- scorecard (%)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.ib_purchase_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_number text not null,
  supplier_id uuid not null references public.ib_suppliers(id),
  material text not null,
  quantity text,
  due_date date,
  origin text not null default 'nacional' check (origin in ('nacional','importado')),
  coverage_days numeric,                    -- cobertura de estoque (extração diária do SAP)
  free_time_until date,                     -- importado: fim do free time (demurrage)
  container_no text,
  bl_no text,
  vessel text,
  eta date,
  vessel_delay_days int not null default 0,
  released_at timestamptz,                  -- liberação do broker
  broker_id uuid references public.ib_suppliers(id),
  status text not null default 'open' check (status in ('open','scheduled','received','closed')),
  sap_extracted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, po_number)
);
create index if not exists ib_po_supplier_idx on public.ib_purchase_orders(tenant_id, supplier_id);

create table if not exists public.ib_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid not null references public.ib_plants(id),
  code text not null,                       -- LOU-20260925-0701
  dock_id uuid references public.ib_docks(id),
  po_id uuid references public.ib_purchase_orders(id),
  supplier_id uuid not null references public.ib_suppliers(id),
  load_type_id uuid not null references public.ib_load_types(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested','scheduled','confirmed','en_route','at_gate','in_yard','at_dock','completed','no_show','cancelled')),
  vehicle_plate text,
  driver_name text,
  driver_phone text,
  container_no text,
  nfe_key text,
  eta_at timestamptz,
  arrived_at timestamptz,
  yard_spot text,
  priority_score numeric,
  priority_reason text,
  source text not null default 'portal' check (source in ('portal','broker_email','analyst','zeus')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code),
  check (ends_at > starts_at)
);
create index if not exists ib_appt_day_idx on public.ib_appointments(tenant_id, plant_id, starts_at);
create index if not exists ib_appt_supplier_idx on public.ib_appointments(tenant_id, supplier_id, starts_at);

create table if not exists public.ib_appointment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  appointment_id uuid not null references public.ib_appointments(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('booked','validated','notified','checkin','eta','gate','yard','dock_call','dock_in','completed','no_show','rescheduled','cancelled','note','zeus')),
  note text,
  actor_id uuid references public.profiles(id),
  meta jsonb not null default '{}'::jsonb
);
create index if not exists ib_appt_events_idx on public.ib_appointment_events(appointment_id, at);

create table if not exists public.ib_releases (               -- liberados do dia (e-mails dos brokers)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  broker_id uuid not null references public.ib_suppliers(id),
  po_id uuid references public.ib_purchase_orders(id),
  container_no text not null,
  free_time_days int,
  received_at timestamptz not null default now(),
  source_subject text,
  appointment_id uuid references public.ib_appointments(id) on delete set null,
  suggested_at timestamptz,
  suggestion_reason text,
  status text not null default 'new' check (status in ('new','proposed','scheduled','ignored'))
);

create table if not exists public.ib_yard_spots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid not null references public.ib_plants(id) on delete cascade,
  code text not null,
  zone text not null default 'B',
  appointment_id uuid references public.ib_appointments(id) on delete set null,
  occupied_since timestamptz,
  unique (plant_id, code)
);

create table if not exists public.ib_gate_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid not null references public.ib_plants(id),
  appointment_id uuid references public.ib_appointments(id) on delete set null,
  plate text,
  at timestamptz not null default now(),
  kind text not null check (kind in ('read','match','mismatch','gate_in','gate_out','evidence')),
  checklist jsonb not null default '{}'::jsonb,
  evidence_url text,
  note text,
  actor_id uuid references public.profiles(id)
);

create table if not exists public.ib_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid references public.ib_plants(id) on delete cascade,
  key text not null,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  unique (tenant_id, plant_id, key)
);

create table if not exists public.ib_horizon (                -- linha do tempo por PO (pedido → embarque → navio → liberação → janela)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_id uuid not null references public.ib_purchase_orders(id) on delete cascade,
  stage text not null check (stage in ('pedido','embarque','navio','liberacao','confirma','janela')),
  starts_on date not null,
  ends_on date not null,
  flag text check (flag in ('delay','crit')),
  note text
);

create table if not exists public.ib_capacity (               -- capacidade da planta por dia (pallets)
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plant_id uuid not null references public.ib_plants(id) on delete cascade,
  day date not null,
  capacity_pallets int not null,
  demand_pallets int not null,
  unique (plant_id, day)
);

create table if not exists public.ib_zeus_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists ib_zeus_user_idx on public.ib_zeus_messages(tenant_id, user_id, created_at);

-- Dia útil relativo: 0 = hoje (ou a última sexta, no fim de semana)
create or replace function app.biz_day(n int) returns date language plpgsql stable as $$
declare d date := current_date; step int := case when n >= 0 then 1 else -1 end; left_ int := abs(n);
begin
  while extract(isodow from d) in (6,7) loop d := d - 1; end loop;
  while left_ > 0 loop
    d := d + step;
    if extract(isodow from d) not in (6,7) then left_ := left_ - 1; end if;
  end loop;
  return d;
end $$;

-- ---------------------------------------------------------------------
-- Prioridade v1 (transparente): free time, cobertura de estoque, prazo
-- ---------------------------------------------------------------------
create or replace function public.ib_priority(p_po uuid) returns table(score numeric, reason text)
language plpgsql stable security definer set search_path = public as $$
declare po public.ib_purchase_orders; s numeric := 50; r text[] := '{}'; ft int;
begin
  select * into po from public.ib_purchase_orders where id = p_po;
  if po.id is null then return query select null::numeric, 'PO não encontrada'; return; end if;
  if po.free_time_until is not null then
    ft := po.free_time_until - app.biz_day(0);
    if ft <= 1 then s := s + 40; r := array_append(r, 'free time vence ' || case when ft <= 0 then 'hoje' else 'amanhã' end);
    elsif ft <= 3 then s := s + 20; r := array_append(r, 'free time em ' || ft || ' dias');
    end if;
  end if;
  if po.coverage_days is not null then
    if po.coverage_days <= 2 then s := s + 35; r := array_append(r, 'cobertura de ' || po.coverage_days || ' dias');
    elsif po.coverage_days <= 4 then s := s + 15; r := array_append(r, 'cobertura de ' || po.coverage_days || ' dias');
    elsif po.coverage_days >= 10 then s := s - 15; r := array_append(r, 'cobertura folgada, ' || po.coverage_days || ' dias');
    end if;
  end if;
  if po.due_date is not null and po.due_date < app.biz_day(0) then s := s + 20; r := array_append(r, 'prazo da PO vencido'); end if;
  if po.vessel_delay_days > 0 then r := array_append(r, 'navio ' || po.vessel_delay_days || ' dias atrasado'); end if;
  return query select least(100, greatest(0, s)), coalesce(nullif(array_to_string(r, '; '), ''), 'sem urgência');
end $$;

create or replace function app.ib_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger ib_appt_touch before update on public.ib_appointments for each row execute function app.ib_touch();

-- Conflito de doca (mesma doca, sobreposição de horário) impede o agendamento
create or replace function app.ib_check_overlap() returns trigger language plpgsql as $$
begin
  if new.dock_id is null or new.status in ('cancelled','no_show') then return new; end if;
  if exists (
    select 1 from public.ib_appointments a
    where a.dock_id = new.dock_id and a.id <> new.id and a.status not in ('cancelled','no_show','completed')
      and new.starts_at < a.ends_at and new.ends_at > a.starts_at) then
    raise exception 'Doca ocupada nesse horário' using errcode = 'P0002';
  end if;
  return new;
end $$;
create trigger ib_appt_overlap before insert or update on public.ib_appointments for each row execute function app.ib_check_overlap();

-- ---------------------------------------------------------------------
-- Views de leitura (security_invoker: RLS das tabelas vale na view)
-- ---------------------------------------------------------------------
create or replace view public.ib_appointments_v with (security_invoker = true) as
select a.*, d.code as dock_code, d.name as dock_name, d.kind as dock_kind,
       s.code as supplier_code, s.name as supplier_name, s.short_name as supplier_short, s.is_broker, s.punctuality,
       lt.code as load_type_code, lt.name as load_type_name, lt.duration_min, lt.vehicle,
       po.po_number, po.material, po.quantity, po.origin, po.coverage_days, po.free_time_until, po.due_date
from public.ib_appointments a
left join public.ib_docks d on d.id = a.dock_id
join public.ib_suppliers s on s.id = a.supplier_id
join public.ib_load_types lt on lt.id = a.load_type_id
left join public.ib_purchase_orders po on po.id = a.po_id;

create or replace view public.ib_purchase_orders_v with (security_invoker = true) as
select po.*, s.code as supplier_code, s.name as supplier_name, s.short_name as supplier_short, s.is_broker,
       (select count(*) from public.ib_appointments a where a.po_id = po.id and a.status not in ('cancelled','no_show')) as appointments
from public.ib_purchase_orders po join public.ib_suppliers s on s.id = po.supplier_id;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['ib_plants','ib_docks','ib_load_types','ib_suppliers','ib_purchase_orders','ib_appointments',
    'ib_appointment_events','ib_releases','ib_yard_spots','ib_gate_events','ib_rules','ib_horizon','ib_capacity','ib_zeus_messages'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Leitura para membros internos; escrita para admin e operador
create policy ib_plants_sel on public.ib_plants for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_plants_wr on public.ib_plants for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
create policy ib_docks_sel on public.ib_docks for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_docks_wr on public.ib_docks for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
create policy ib_lt_sel on public.ib_load_types for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_lt_wr on public.ib_load_types for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
create policy ib_rules_sel on public.ib_rules for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_rules_wr on public.ib_rules for all to authenticated using (app.is_tenant_admin(tenant_id)) with check (app.is_tenant_admin(tenant_id));
create policy ib_yard_sel on public.ib_yard_spots for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_yard_wr on public.ib_yard_spots for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
create policy ib_gate_sel on public.ib_gate_events for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_gate_wr on public.ib_gate_events for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
create policy ib_hor_sel on public.ib_horizon for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_hor_wr on public.ib_horizon for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
create policy ib_cap_sel on public.ib_capacity for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_cap_wr on public.ib_capacity for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));
create policy ib_rel_sel on public.ib_releases for select to authenticated using (app.has_tenant(tenant_id));
create policy ib_rel_wr on public.ib_releases for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));

-- Fornecedores: internos veem todos; o externo vê só o próprio
create policy ib_sup_sel on public.ib_suppliers for select to authenticated
  using (app.has_tenant(tenant_id) and (app.tenant_role(tenant_id) <> 'external' or id in (select app.my_external_entities(tenant_id))));
create policy ib_sup_wr on public.ib_suppliers for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));

-- POs: internos veem todas; o externo vê as suas
create policy ib_po_sel on public.ib_purchase_orders for select to authenticated
  using (app.has_tenant(tenant_id) and (app.tenant_role(tenant_id) <> 'external' or supplier_id in (select app.my_external_entities(tenant_id))));
create policy ib_po_wr on public.ib_purchase_orders for all to authenticated using (app.can_write(tenant_id)) with check (app.can_write(tenant_id));

-- Agendamentos: internos tudo; externo vê e cria os do próprio fornecedor, e só altera os futuros não iniciados
create policy ib_appt_sel on public.ib_appointments for select to authenticated
  using (app.has_tenant(tenant_id) and (app.tenant_role(tenant_id) <> 'external' or supplier_id in (select app.my_external_entities(tenant_id))));
create policy ib_appt_ins on public.ib_appointments for insert to authenticated
  with check (app.can_write(tenant_id) or (app.tenant_role(tenant_id) = 'external' and supplier_id in (select app.my_external_entities(tenant_id)) and source = 'portal'));
create policy ib_appt_upd on public.ib_appointments for update to authenticated
  using (app.can_write(tenant_id) or (app.tenant_role(tenant_id) = 'external' and supplier_id in (select app.my_external_entities(tenant_id)) and status in ('requested','scheduled','confirmed') and starts_at > now()))
  with check (app.can_write(tenant_id) or (app.tenant_role(tenant_id) = 'external' and supplier_id in (select app.my_external_entities(tenant_id))));
create policy ib_appt_del on public.ib_appointments for delete to authenticated using (app.can_write(tenant_id));

create policy ib_ev_sel on public.ib_appointment_events for select to authenticated
  using (exists (select 1 from public.ib_appointments a where a.id = appointment_id));  -- RLS da tabela de agendamentos filtra
create policy ib_ev_ins on public.ib_appointment_events for insert to authenticated
  with check (app.has_tenant(tenant_id));

create policy ib_zeus_sel on public.ib_zeus_messages for select to authenticated using (user_id = auth.uid() or app.is_tenant_admin(tenant_id));
create policy ib_zeus_ins on public.ib_zeus_messages for insert to authenticated with check (app.has_tenant(tenant_id) and user_id = auth.uid());

grant execute on function public.ib_priority(uuid) to authenticated;
