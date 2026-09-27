#!/usr/bin/env bash
# Recria o banco local, aplica o tenant neutro de demonstração e os usuários de teste. Uso: scripts/local-demo.sh
set -euo pipefail
export PGHOST=${PGHOST:-/home/claude/pglocal} PGPORT=${PGPORT:-5433} PGUSER=${PGUSER:-postgres}
"$(dirname "$0")/db-local.sh" > /dev/null
psql -d z3us -v ON_ERROR_STOP=1 -q <<'SQL'
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator noinherit login; end if; end $$;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated, anon;
update tenants set name='Nortex Consumo', legal_name='Nortex Consumo S.A. (fictício)', email_domains=array['nortex.exemplo','z3us.ai'] where slug='pg';
update ib_plants set code='ITU', name='Itu', address='Rod. do Açúcar, km 12, Itu/SP (fictício)' where code='LOU';
update ib_appointments set code = replace(code, 'LOU-', 'ITU-') where code like 'LOU-%';
update tenant_settings set identity = identity || '{"og_title":"Inbound 360 · Nortex Consumo","email_domain":"nortex.exemplo"}'::jsonb;
update billing_items set description = replace(description, 'Louveira', 'Itu') where description like '%Louveira%';
insert into auth.users (id, email, raw_user_meta_data) values ('aaaaaaaa-0000-4000-8000-000000000001','ana.ribeiro@nortex.exemplo','{"full_name":"Ana Ribeiro"}') on conflict do nothing;
insert into memberships (tenant_id, user_id, role) select id, 'aaaaaaaa-0000-4000-8000-000000000001', 'tenant_admin' from tenants where slug='pg' on conflict do nothing;
insert into auth.users (id, email, raw_user_meta_data) values ('bbbbbbbb-0000-4000-8000-000000000002','carla.menezes@quimicaserrana.exemplo','{"full_name":"Carla Menezes"}') on conflict do nothing;
notify pgrst, 'reload schema';
SQL
psql -d z3us -Atc "select 'demo ok · ' || (select count(*) from ib_purchase_orders_v where plant_id is not null) || ' POs com unidade';"
