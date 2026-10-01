-- =====================================================================
-- Endurecimento depois do advisor de segurança do Supabase (01/10/2026)
-- =====================================================================
-- search_path fixo nas funções que ainda não tinham
alter function app.set_updated_at() set search_path = public;
alter function app.is_personal_email(text) set search_path = public;
alter function app.biz_day(int) set search_path = public;
alter function app.ib_touch() set search_path = public;
alter function app.ib_check_overlap() set search_path = public;

-- Limpeza do tenant de demonstração em função própria (o seed chama antes de recriar)
create or replace function app.ib_seed_clear(t uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tbl text;
begin
  foreach tbl in array array['ib_zeus_messages','ib_gate_events','ib_releases','ib_appointment_events','ib_yard_spots','ib_appointments',
    'ib_horizon','ib_capacity','ib_purchase_orders','ib_load_types','ib_docks','ib_rules','ib_suppliers','ib_gates','billing_items','ib_plants','faq_items'] loop
    execute format('delete from public.%I where tenant_id = $1', tbl) using t;
  end loop;
end $$;
create or replace function app.ib_clear_events(a uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.ib_appointment_events where appointment_id = a;
end $$;

-- RPCs públicas só para usuários autenticados (o grant padrão do Postgres dava EXECUTE a PUBLIC, logo ao anon)
revoke execute on function public.accept_invite(text), public.access_state(uuid), public.engagement_summary(uuid,int), public.grant_membership(text,text,text),
  public.ib_priority(uuid), public.my_role(uuid), public.my_tenants(), public.reset_demo(text), public.set_billing_status(uuid,text,date), public.touch_presence(uuid)
  from public, anon;
revoke execute on function app.ib_seed_demo(text), app.ib_seed_clear(uuid), app.ib_clear_events(uuid), app.expire_external_identities(), app.handle_new_user(),
  app.set_updated_at(), app.ib_touch(), app.ib_check_overlap() from public, anon, authenticated;

-- Nota: a view public.tenant_public fica SECURITY DEFINER de propósito (a tela de login lê só marca e identidade pelo slug,
-- sem abrir a tabela tenants ao anon). O advisor marca como ERROR; é decisão registrada.
