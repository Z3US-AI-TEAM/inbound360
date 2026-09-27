-- =====================================================================
-- Vínculo automático de identidades externas e semente de demonstração
-- (dados fictícios, sempre relativos ao dia útil corrente)
-- =====================================================================

-- Ao criar o perfil, liga o usuário à identidade externa com o mesmo e-mail (papel external)
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if app.is_personal_email(new.email) then
    raise exception 'E-mail pessoal não é aceito. Use o e-mail da sua empresa.' using errcode = 'P0001';
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  for e in select * from public.external_identities x where lower(x.email) = lower(new.email) and x.status = 'active' loop
    update public.external_identities set user_id = new.id where id = e.id;
    insert into public.memberships (tenant_id, user_id, role, status)
    values (e.tenant_id, new.id, 'external', 'active') on conflict (tenant_id, user_id) do nothing;
  end loop;
  -- convite pendente com o mesmo e-mail vira membro na hora
  for e in select * from public.invites i where lower(i.email) = lower(new.email) and i.accepted_at is null and i.expires_at > now() loop
    insert into public.memberships (tenant_id, user_id, role, status, invited_by)
    values (e.tenant_id, new.id, e.role, 'active', e.invited_by) on conflict (tenant_id, user_id) do nothing;
    update public.invites set accepted_at = now() where id = e.id;
  end loop;
  return new;
end $$;

-- Concede papel a um e-mail já cadastrado (admin do tenant ou da plataforma)
create or replace function app.grant_membership(p_email text, p_slug text, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid; u uuid;
begin
  select id into t from public.tenants where slug = p_slug;
  if t is null then raise exception 'Tenant % não existe', p_slug; end if;
  if not app.is_tenant_admin(t) then raise exception 'Sem permissão'; end if;
  select id into u from public.profiles where lower(email) = lower(p_email);
  if u is null then raise exception 'Usuário % ainda não se cadastrou', p_email; end if;
  insert into public.memberships (tenant_id, user_id, role, status, invited_by) values (t, u, p_role, 'active', auth.uid())
  on conflict (tenant_id, user_id) do update set role = excluded.role, status = 'active';
end $$;
grant execute on function app.grant_membership(text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Semente de demonstração: P&G Planta Louveira (dados fictícios)
-- Reexecutável: apaga e recria os dados da solução do tenant demo.
-- ---------------------------------------------------------------------
create or replace function app.ib_seed_demo(p_slug text default 'pg') returns text
language plpgsql security definer set search_path = public as $$
declare
  t uuid; pl uuid; d0 date := app.biz_day(0); d1 date := app.biz_day(1); d2 date := app.biz_day(2);
  tz text := 'America/Sao_Paulo';
  dock jsonb; lt jsonb; sup jsonb; po jsonb; ap jsonb; rel jsonb; hz jsonb; seg jsonb;
  dock_ids jsonb := '{}'; lt_ids jsonb := '{}'; sup_ids jsonb := '{}'; po_ids jsonb := '{}'; appt_by_seq jsonb := '{}';
  a_id uuid; day date; st timestamptz; en timestamptz; dur int; status text; code text; seq int; i int; cov jsonb;
  pr record;
begin
  -- tenant e núcleo
  insert into public.tenants (slug, name, legal_name, solution, brand_mode, product_name, email_domains, status, demo)
  values (p_slug, 'P&G', 'Procter & Gamble do Brasil (cliente de demonstração)', 'inbound360', 'z3us', 'Inbound 360', array['pg.com','z3us.ai'], 'active', true)
  on conflict (slug) do update set name = excluded.name, demo = true returning id into t;

  insert into public.tenant_settings (tenant_id, identity, params, danger) values (t,
    '{"og_title":"Inbound 360 · P&G","email_domain":"pg.com","og_description":"Docas, gate e pátio numa camada externa por cima do SAP e do WMS.","login_tagline":"O fornecedor agenda. A planta vê. A doca recebe na ordem certa."}',
    '{"sap_extraction_time":"06:30","zeus_persona":"Zeus, assistente do inbound da planta"}',
    '{"warn_days":3,"bar_days":7,"block_days":15}')
  on conflict (tenant_id) do update set identity = excluded.identity, params = excluded.params;

  insert into public.billing_accounts (tenant_id, plan, amount_cents, period, closing_day, report_to_email, status)
  values (t, 'piloto', 0, 'monthly', 30, 'financeiro@z3us.ai', 'ok') on conflict (tenant_id) do nothing;

  -- limpa dados da solução (ordem por dependência)
  delete from public.ib_zeus_messages where tenant_id = t;
  delete from public.ib_gate_events where tenant_id = t;
  delete from public.ib_releases where tenant_id = t;
  delete from public.ib_appointment_events where tenant_id = t;
  delete from public.ib_yard_spots where tenant_id = t;
  delete from public.ib_appointments where tenant_id = t;
  delete from public.ib_horizon where tenant_id = t;
  delete from public.ib_capacity where tenant_id = t;
  delete from public.ib_purchase_orders where tenant_id = t;
  delete from public.ib_load_types where tenant_id = t;
  delete from public.ib_docks where tenant_id = t;
  delete from public.ib_rules where tenant_id = t;
  delete from public.ib_suppliers where tenant_id = t;
  delete from public.ib_gates where tenant_id = t;
  delete from public.billing_items where tenant_id = t;
  delete from public.ib_plants where tenant_id = t;

  insert into public.ib_plants (tenant_id, code, name, address, timezone, open_time, close_time, slot_minutes)
  values (t, 'LOU', 'Louveira', 'Rua Francisco Pereira Dutra, Louveira/SP (portaria a confirmar)', tz, '06:00', '22:00', 15)
  returning id into pl;

  insert into public.ib_gates (tenant_id, plant_id, code, name, sort) values
    (t, pl, 'P1', 'Portaria 1 · principal', 1),
    (t, pl, 'P2', 'Portaria 2 · recebimento', 2);

  -- billing por unidade e portaria (valor unitário pela Tabela v1; aqui só a contagem)
  insert into public.billing_items (tenant_id, plant_id, kind, description, qty, unit_price_cents) values
    (t, null, 'plataforma', 'Inbound 360 · plataforma (tenant)', 1, 0),
    (t, pl, 'unidade', 'Unidade Louveira', 1, 0),
    (t, pl, 'portaria', 'Portarias da unidade Louveira', 2, 0);

  for dock in select * from jsonb_array_elements('[
    {"c":"D1","n":"Doca 1","k":"paletizada"},{"c":"D2","n":"Doca 2","k":"paletizada"},{"c":"D3","n":"Doca 3","k":"paletizada"},
    {"c":"D4","n":"Doca 4","k":"paletizada"},{"c":"D5","n":"Doca 5","k":"manual"},{"c":"D6","n":"Doca 6","k":"conteiner"}]'::jsonb) loop
    insert into public.ib_docks (tenant_id, plant_id, code, name, kind, sort) values (t, pl, dock->>'c', dock->>'n', dock->>'k', (substr(dock->>'c',2))::int) returning id into a_id;
    dock_ids := dock_ids || jsonb_build_object(dock->>'c', a_id);
  end loop;

  for lt in select * from jsonb_array_elements('[
    {"c":"pal_car","n":"Paletizada · carreta","d":60,"v":"Carreta","h":"paletizada","s":true},
    {"c":"pal_tru","n":"Paletizada · truck","d":45,"v":"Truck","h":"paletizada","s":true},
    {"c":"man_tru","n":"Manual · truck","d":90,"v":"Truck","h":"manual","s":true},
    {"c":"man_uti","n":"Manual · utilitário","d":30,"v":"Utilitário","h":"manual","s":true},
    {"c":"ctn40","n":"Contêiner 40 pés","d":90,"v":"Carreta porta-contêiner","h":"conteiner","s":false},
    {"c":"ctn20","n":"Contêiner 20 pés","d":60,"v":"Carreta porta-contêiner","h":"conteiner","s":false}]'::jsonb) loop
    insert into public.ib_load_types (tenant_id, plant_id, code, name, duration_min, vehicle, handling, supplier_can_book)
    values (t, pl, lt->>'c', lt->>'n', (lt->>'d')::int, lt->>'v', lt->>'h', (lt->>'s')::boolean) returning id into a_id;
    lt_ids := lt_ids || jsonb_build_object(lt->>'c', a_id);
  end loop;

  for sup in select * from jsonb_array_elements('[
    {"c":"QS","s":"Q. Serrana","n":"Química Serrana","city":"Jundiaí/SP","dist":"5 min da planta","max":3,"lead":2,"p":96,"ct":"Carla Menezes","tel":"+55 11 9xxxx-2201","dom":"quimicaserrana.exemplo"},
    {"c":"PJ","s":"P. Jundiá","n":"Plásticos Jundiá","city":"Jundiaí/SP","dist":"12 min","max":2,"lead":24,"p":71,"ct":"Douglas Ferraz","tel":"+55 11 9xxxx-4410","dom":"plasticosjundia.exemplo"},
    {"c":"AS","s":"Aromas Sul","n":"Aromas do Sul","city":"Vinhedo/SP","dist":"20 min","max":2,"lead":24,"p":92,"ct":"Renata Lombardi","tel":"+55 19 9xxxx-3388","dom":"aromasdosul.exemplo"},
    {"c":"TV","s":"T. Vale Azul","n":"Tampas Vale Azul","city":"Itupeva/SP","dist":"25 min","max":2,"lead":24,"p":88,"ct":"Marcos Tadeu","tel":"+55 11 9xxxx-7702","dom":"tampasvaleazul.exemplo"},
    {"c":"PI","s":"P. Itupeva","n":"Papelão Itupeva","city":"Itupeva/SP","dist":"22 min","max":4,"lead":24,"p":97,"ct":"Simone Prado","tel":"+55 11 9xxxx-1190","dom":"papelaoitupeva.exemplo"},
    {"c":"EC","s":"E. Campinas","n":"Etiquetas Campinas","city":"Campinas/SP","dist":"40 min","max":2,"lead":24,"p":90,"ct":"Fábio Nakamura","tel":"+55 19 9xxxx-5566","dom":"etiquetascampinas.exemplo"},
    {"c":"RP","s":"R. Paulista","n":"Rótulos Paulista","city":"Campinas/SP","dist":"45 min","max":2,"lead":24,"p":83,"ct":"Letícia Amaral","tel":"+55 19 9xxxx-9034","dom":"rotulospaulista.exemplo"},
    {"c":"BA","s":"D. Atlântico","n":"Despacho Atlântico","city":"Santos/SP","dist":"broker","max":6,"lead":24,"p":94,"ct":"Ricardo Sá","tel":"+55 13 9xxxx-6070","dom":"despachoatlantico.exemplo","b":true},
    {"c":"BL","s":"C. Litoral","n":"Comex Litoral","city":"Santos/SP","dist":"broker","max":6,"lead":24,"p":89,"ct":"Paula Freire","tel":"+55 13 9xxxx-2210","dom":"comexlitoral.exemplo","b":true}]'::jsonb) loop
    insert into public.ib_suppliers (tenant_id, code, name, short_name, city, distance_note, is_broker, email_domains, contact_name, contact_phone, max_windows_per_day, min_lead_hours, cutoff_time, punctuality)
    values (t, sup->>'c', sup->>'n', sup->>'s', sup->>'city', sup->>'dist', coalesce((sup->>'b')::boolean, false), array[sup->>'dom'], sup->>'ct', sup->>'tel', (sup->>'max')::int, (sup->>'lead')::int, '16:00', (sup->>'p')::int)
    returning id into a_id;
    sup_ids := sup_ids || jsonb_build_object(sup->>'c', a_id);
  end loop;

  cov := '{"Tensoativo base LAS":4,"Silicato de sódio":7,"Frascos PET 500 ml":3,"Frascos PET 1 L":1,"Fragrância lavanda 22":5,"Fragrância cítrica 07":1.5,"Tampas flip-top 28 mm":9,"Caixas de embarque 12x":6,"Bandejas de papelão":8,"Etiquetas frontais":4,"Etiquetas verso":6,"Rótulos sleeve":3,"Pasta fluorescente":6,"Enzima protease":2,"Tensoativo não iônico":11,"Perfume base amaciante":12,"Polímero base · sazonal":4}';

  -- POs (prazo em dias úteis relativos; importadas com free time)
  for po in select * from jsonb_array_elements('[
    {"po":"4500918233","f":"QS","m":"Tensoativo base LAS","q":"22 pallets","d":0},
    {"po":"4500918240","f":"QS","m":"Silicato de sódio","q":"18 pallets","d":0},
    {"po":"4500918251","f":"QS","m":"Tensoativo base LAS","q":"22 pallets","d":1},
    {"po":"4500922877","f":"QS","m":"Tensoativo base LAS","q":"24 pallets","d":4},
    {"po":"4500919870","f":"PJ","m":"Frascos PET 500 ml","q":"26 pallets","d":0},
    {"po":"4500919877","f":"PJ","m":"Frascos PET 1 L","q":"26 pallets","d":-1},
    {"po":"4500919881","f":"PJ","m":"Frascos PET 500 ml","q":"20 pallets","d":0},
    {"po":"4500921100","f":"AS","m":"Fragrância lavanda 22","q":"6 pallets","d":0},
    {"po":"4500921104","f":"AS","m":"Fragrância cítrica 07","q":"4 pallets","d":0},
    {"po":"4500921109","f":"AS","m":"Fragrância lavanda 22","q":"8 pallets","d":1},
    {"po":"4500920310","f":"TV","m":"Tampas flip-top 28 mm","q":"14 pallets","d":0},
    {"po":"4500920318","f":"TV","m":"Tampas flip-top 28 mm","q":"14 pallets","d":2},
    {"po":"4500922301","f":"PI","m":"Caixas de embarque 12x","q":"30 pallets","d":0},
    {"po":"4500922310","f":"PI","m":"Caixas de embarque 12x","q":"30 pallets","d":3},
    {"po":"4500922315","f":"PI","m":"Bandejas de papelão","q":"16 pallets","d":0},
    {"po":"4500923005","f":"EC","m":"Etiquetas frontais","q":"3 pallets","d":0},
    {"po":"4500923011","f":"EC","m":"Etiquetas verso","q":"3 pallets","d":1},
    {"po":"4500923410","f":"RP","m":"Rótulos sleeve","q":"5 pallets","d":0},
    {"po":"4500923418","f":"RP","m":"Rótulos sleeve","q":"5 pallets","d":1},
    {"po":"4500918260","f":"QS","m":"Silicato de sódio","q":"16 pallets","d":3},
    {"po":"4500918277","f":"QS","m":"Tensoativo base LAS","q":"22 pallets","d":6},
    {"po":"4500922330","f":"PI","m":"Bandejas de papelão","q":"18 pallets","d":5},
    {"po":"4500923020","f":"EC","m":"Etiquetas frontais","q":"4 pallets","d":4},
    {"po":"4500921120","f":"AS","m":"Fragrância cítrica 07","q":"5 pallets","d":3},
    {"po":"4500907711","f":"BA","m":"Pasta fluorescente","q":"1 × 40 pés","d":1,"imp":true,"ft":1,"ctn":"ZZAU 448120-3","rel":true},
    {"po":"4500907720","f":"BA","m":"Enzima protease","q":"1 × 40 pés","d":3,"imp":true,"ft":4,"ctn":"ZZAU 451050-2","rel":true},
    {"po":"4500907702","f":"BA","m":"Pasta fluorescente","q":"1 × 40 pés","d":0,"imp":true,"ft":3,"ctn":"ZZAU 447901-7","rel":true},
    {"po":"4500907690","f":"BA","m":"Tensoativo não iônico","q":"1 × 20 pés","d":0,"imp":true,"ft":3,"ctn":"ZZAU 302118-4","rel":true},
    {"po":"4500908133","f":"BL","m":"Perfume base amaciante","q":"1 × 40 pés","d":2,"imp":true,"ft":2,"ctn":"KLBU 220981-1","rel":true},
    {"po":"4500908140","f":"BL","m":"Polímero base · sazonal","q":"1 × 40 pés","d":5,"imp":true,"ft":6,"ctn":"KLBU 221340-5","delay":4},
    {"po":"4500908120","f":"BL","m":"Perfume base amaciante","q":"1 × 40 pés","d":0,"imp":true,"ft":1,"ctn":"KLBU 219744-6","rel":true},
    {"po":"4500908125","f":"BL","m":"Enzima protease","q":"1 × 20 pés","d":0,"imp":true,"ft":3,"ctn":"KLBU 220315-2","rel":true},
    {"po":"4500909012","f":"BA","m":"Tensoativo não iônico","q":"1 × 40 pés","d":17,"imp":true,"ft":30,"eta":14},
    {"po":"4500909377","f":"BL","m":"Polímero base · sazonal","q":"1 × 40 pés","d":24,"imp":true,"ft":40,"eta":21,"delay":9},
    {"po":"4500909900","f":"BA","m":"Enzima protease · lote 2","q":"1 × 40 pés","d":34,"imp":true,"ft":50,"eta":31},
    {"po":"4500910245","f":"BL","m":"Pasta fluorescente · lote 2","q":"1 × 40 pés","d":40,"imp":true,"ft":56,"eta":37}]'::jsonb) loop
    insert into public.ib_purchase_orders (tenant_id, plant_id, po_number, supplier_id, material, quantity, due_date, origin, coverage_days, free_time_until, container_no, eta, vessel_delay_days, released_at, broker_id, status)
    values (t, pl, po->>'po', (sup_ids->>(po->>'f'))::uuid, po->>'m', po->>'q', app.biz_day((po->>'d')::int),
      case when coalesce((po->>'imp')::boolean,false) then 'importado' else 'nacional' end,
      (cov->>(split_part(po->>'m',' · lote',1)))::numeric,
      case when po ? 'ft' then current_date + (po->>'ft')::int else null end,
      po->>'ctn', case when po ? 'eta' then current_date + (po->>'eta')::int else null end,
      coalesce((po->>'delay')::int, 0),
      case when coalesce((po->>'rel')::boolean,false) then (d0::timestamp + time '08:40') at time zone tz else null end,
      case when coalesce((po->>'imp')::boolean,false) then (sup_ids->>(po->>'f'))::uuid else null end, 'open')
    returning id into a_id;
    po_ids := po_ids || jsonb_build_object(po->>'po', a_id);
  end loop;

  -- Agendamentos: [seq, forn, po, lt, doca, dia, início, status, placa, eta, extra]
  for ap in select * from jsonb_array_elements('[
    [701,"QS","4500918233","pal_car","D1",0,"06:00","completed","FBR2A19"],
    [702,"PJ","4500919870","pal_car","D1",0,"07:15","completed","GHT5C22"],
    [703,"AS","4500921100","pal_tru","D1",0,"08:30","completed","EJK7D31"],
    [704,"QS","4500918240","pal_car","D1",0,"09:45","at_dock","FBR2A19"],
    [705,"TV","4500920310","pal_tru","D1",0,"11:00","en_route","HLM3E80","10:52"],
    [706,"PI","4500922301","pal_car","D1",0,"13:00","confirmed","IPQ9F14"],
    [707,"QS","4500918251","pal_car","D1",0,"15:00","confirmed","FBS4A77"],
    [708,"EC","4500923005","pal_tru","D1",0,"17:00","confirmed","JRT1G55"],
    [711,"PI","4500922315","pal_car","D2",0,"06:30","completed","IPQ9F14"],
    [712,"EC","4500923011","pal_tru","D2",0,"08:00","completed","JRT1G55"],
    [713,"PJ","4500919881","pal_car","D2",0,"09:00","no_show","GHU8C90"],
    [714,"AS","4500921109","pal_tru","D2",0,"10:30","en_route","EJK7D31","10:41"],
    [715,"RP","4500923410","pal_tru","D2",0,"12:00","confirmed","KLZ6H02"],
    [716,"PI","4500922310","pal_car","D2",0,"15:30","confirmed","IPR2F60"],
    [717,"QS","4500918251","pal_car","D2",0,"18:00","confirmed","FBS4A77"],
    [721,"AS","4500921100","pal_tru","D3",0,"06:00","completed","EJL2D44"],
    [722,"RP","4500923418","pal_tru","D3",0,"07:30","completed","KLZ6H02"],
    [723,"TV","4500920318","pal_tru","D3",0,"09:15","at_dock","HLM3E80"],
    [724,"PJ","4500919870","pal_car","D3",0,"10:30","in_yard","GHT5C22",null,{"chegou":"10:02","vaga":"B3"}],
    [725,"EC","4500923005","pal_tru","D3",0,"12:30","confirmed","JRU4G21"],
    [726,"QS","4500918240","pal_car","D3",0,"14:00","confirmed","FBR2A19"],
    [727,"AS","4500921104","pal_tru","D3",0,"16:00","requested",null],
    [731,"PJ","4500919881","pal_car","D4",0,"06:15","completed","GHU8C90"],
    [732,"QS","4500918233","pal_car","D4",0,"08:00","completed","FBS4A77"],
    [733,"RP","4500923410","pal_tru","D4",0,"10:00","at_gate","FQH2D47",null,{"chegou":"09:58"}],
    [734,"EC","4500923011","pal_tru","D4",0,"11:30","confirmed","JRT1G55"],
    [735,"PI","4500922315","pal_car","D4",0,"15:00","confirmed","IPR2F60"],
    [736,"TV","4500920318","pal_tru","D4",0,"16:30","requested",null],
    [741,"EC","4500923005","man_tru","D5",0,"07:00","completed","JRU4G21"],
    [742,"RP","4500923418","man_uti","D5",0,"09:00","completed","KMA1H88"],
    [743,"AS","4500921109","man_tru","D5",0,"10:00","at_dock","EJL2D44"],
    [744,"PJ","4500919877","man_tru","D5",0,"13:00","en_route","GHV3C15","12:40"],
    [745,"EC","4500923011","man_uti","D5",0,"15:00","confirmed","JRV7G09"],
    [746,"RP","4500923418","man_tru","D5",0,"16:00","requested",null],
    [751,"BA","4500907702","ctn40","D6",0,"06:00","completed","LNC4J31",null,{"ctn":"ZZAU 447901-7"}],
    [752,"BA","4500907690","ctn20","D6",0,"08:00","completed","LND8J02",null,{"ctn":"ZZAU 302118-4"}],
    [753,"BL","4500908120","ctn40","D6",0,"09:30","at_dock","MPA2K77",null,{"ctn":"KLBU 219744-6"}],
    [754,"BL","4500908125","ctn20","D6",0,"11:30","en_route","MPB6K18","11:20",{"ctn":"KLBU 220315-2"}],
    [755,"BA","4500907711","ctn40","D6",0,"14:00","confirmed","LNC4J31",null,{"ctn":"ZZAU 448120-3"}],
    [756,"BL","4500908120","ctn40","D6",0,"16:00","confirmed","MPA2K77",null,{"ctn":"KLBU 219750-9"}],
    [757,"BA","4500907702","ctn40","D6",0,"18:00","confirmed","LND8J02",null,{"ctn":"ZZAU 447922-1"}],
    [761,"QS","4500918251","pal_car","D1",1,"06:00","confirmed","FBR2A19"],
    [762,"PI","4500922310","pal_car","D2",1,"07:00","confirmed","IPQ9F14"],
    [763,"AS","4500921109","pal_tru","D3",1,"09:00","confirmed","EJK7D31"],
    [764,"EC","4500923011","pal_tru","D4",1,"10:00","confirmed","JRT1G55"],
    [765,"TV","4500920318","pal_tru","D1",1,"13:00","confirmed","HLM3E80"],
    [766,"RP","4500923418","man_tru","D5",1,"08:00","confirmed","KLZ6H02"],
    [767,"BA","4500907720","ctn40","D6",1,"10:00","confirmed","LNC4J31",null,{"ctn":"ZZAU 451050-2"}]]'::jsonb) loop
    seq := (ap->>0)::int;
    day := case when (ap->>5)::int = 0 then d0 else d1 end;
    dur := (select duration_min from public.ib_load_types where id = (lt_ids->>(ap->>3))::uuid);
    st := (day::timestamp + (ap->>6)::time) at time zone tz;
    en := st + make_interval(mins => dur);
    status := ap->>7;
    code := 'LOU-' || to_char(day, 'YYYYMMDD') || '-' || lpad(seq::text, 4, '0');
    insert into public.ib_appointments (tenant_id, plant_id, code, dock_id, po_id, supplier_id, load_type_id, starts_at, ends_at, status,
      vehicle_plate, container_no, eta_at, arrived_at, yard_spot, source, priority_score, priority_reason)
    select t, pl, code, (dock_ids->>(ap->>4))::uuid, (po_ids->>(ap->>2))::uuid, (sup_ids->>(ap->>1))::uuid, (lt_ids->>(ap->>3))::uuid, st, en, status,
      ap->>8, ap->10->>'ctn',
      case when (ap->>9) is not null then (day::timestamp + (ap->>9)::time) at time zone tz else null end,
      case when (ap->10->>'chegou') is not null then (day::timestamp + (ap->10->>'chegou')::time) at time zone tz
           when status in ('at_dock','completed','in_yard') then st - interval '12 minutes' else null end,
      ap->10->>'vaga',
      case when (select is_broker from public.ib_suppliers where id = (sup_ids->>(ap->>1))::uuid) then 'broker_email' else 'portal' end,
      p.score, p.reason
    from public.ib_priority((po_ids->>(ap->>2))::uuid) p
    returning id into a_id;
    appt_by_seq := appt_by_seq || jsonb_build_object(seq::text, a_id);

    -- eventos
    insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values
      (t, a_id, st - interval '26 hours', 'booked', case when (select is_broker from public.ib_suppliers where id = (sup_ids->>(ap->>1))::uuid)
         then 'Broker enviou os liberados; janela proposta pelo Zeus e aceita · PO ' || (ap->>2) || ' validada no SAP'
         else 'Fornecedor agendou pelo portal · PO ' || (ap->>2) || ' validada no SAP' end),
      (t, a_id, st - interval '26 hours' + interval '1 minute', 'notified', 'Confirmação enviada por e-mail e WhatsApp; link de check-in gerado para o motorista');
    if status = 'requested' then
      delete from public.ib_appointment_events where appointment_id = a_id;
      insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values
        (t, a_id, now() - interval '42 minutes', 'booked', 'Fornecedor pediu a janela pelo portal; PO ' || (ap->>2) || ' validada no SAP'),
        (t, a_id, now() - interval '41 minutes', 'note', 'Fila da analista: prioridade calculada por cobertura de estoque e free time');
    end if;
    if status in ('en_route','at_gate','in_yard','at_dock','completed') then
      insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values (t, a_id, st - interval '75 minutes', 'checkin', 'Motorista fez o check-in pelo link; posição compartilhada');
    end if;
    if status in ('at_gate','in_yard','at_dock','completed') then
      insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values (t, a_id, coalesce((select arrived_at from public.ib_appointments where id = a_id), st - interval '10 minutes'), 'gate', 'Portaria 2: placa lida pelo Apolo, agendamento conferido, NF-e validada');
    end if;
    if status in ('in_yard','at_dock','completed') then
      insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values (t, a_id, coalesce((select arrived_at from public.ib_appointments where id = a_id), st - interval '10 minutes') + interval '4 minutes', 'yard', 'Pátio B, vaga ' || coalesce(ap->10->>'vaga', 'B1') || '; motorista avisado pelo WhatsApp');
    end if;
    if status in ('at_dock','completed') then
      insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values (t, a_id, st, 'dock_in', 'Chamado para a doca; início da descarga');
    end if;
    if status = 'completed' then
      insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values (t, a_id, en - interval '4 minutes', 'completed', 'Descarga concluída; conferência do Apolo sem divergência');
    end if;
    if status = 'no_show' then
      insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values (t, a_id, st + interval '30 minutes', 'no_show', 'Sem chegada 30 min após a janela; no-show registrado e fornecedor notificado');
    end if;
    if status = 'en_route' and (ap->>9) is not null then
      insert into public.ib_appointment_events (tenant_id, appointment_id, at, kind, note) values (t, a_id, now() - interval '9 minutes', 'eta', 'Previsão de chegada ' || (ap->>9) || '; doca avisada');
    end if;
  end loop;

  -- pátio
  insert into public.ib_yard_spots (tenant_id, plant_id, code, zone, appointment_id, occupied_since)
  select t, pl, 'B' || g, 'B', case when g = 3 then (appt_by_seq->>'724')::uuid else null end,
         case when g = 3 then (d0::timestamp + time '10:06') at time zone tz else null end
  from generate_series(1, 8) g;

  -- liberados do dia
  for rel in select * from jsonb_array_elements('[
    {"b":"BA","ctn":"ZZAU 448120-3","po":"4500907711","ft":1,"h":"08:40","seq":755},
    {"b":"BA","ctn":"ZZAU 451077-8","po":"4500907720","ft":4,"h":"08:40"},
    {"b":"BA","ctn":"ZZAU 451050-2","po":"4500907720","ft":4,"h":"08:40","seq":767},
    {"b":"BL","ctn":"KLBU 220981-1","po":"4500908133","ft":2,"h":"09:05"},
    {"b":"BL","ctn":"KLBU 221340-5","po":"4500908140","ft":6,"h":"09:05"},
    {"b":"BL","ctn":"KLBU 219750-9","po":"4500908120","ft":1,"h":"09:05","seq":756},
    {"b":"BL","ctn":"KLBU 220990-4","po":"4500908133","ft":2,"h":"09:05"}]'::jsonb) loop
    insert into public.ib_releases (tenant_id, plant_id, broker_id, po_id, container_no, free_time_days, received_at, source_subject, appointment_id, status)
    values (t, pl, (sup_ids->>(rel->>'b'))::uuid, (po_ids->>(rel->>'po'))::uuid, rel->>'ctn', (rel->>'ft')::int,
      (d0::timestamp + (rel->>'h')::time) at time zone tz, 'Liberados do dia ' || to_char(d0, 'DD/MM'),
      case when rel ? 'seq' then (appt_by_seq->>(rel->>'seq'))::uuid else null end,
      case when rel ? 'seq' then 'scheduled' else 'new' end);
  end loop;

  -- horizonte (segmentos em dias relativos)
  for hz in select * from jsonb_array_elements('[
    {"po":"4500907711","seg":[["pedido",-38,-30],["embarque",-30,-29],["navio",-29,-3],["liberacao",-3,0],["janela",1,1]],"note":"liberado ontem; janela amanhã 06:00"},
    {"po":"4500907720","seg":[["pedido",-35,-27],["embarque",-27,-26],["navio",-26,-2],["liberacao",-2,0],["janela",1,1]],"note":"cobertura de 2 dias"},
    {"po":"4500908133","seg":[["pedido",-34,-25],["embarque",-25,-24],["navio",-24,-1],["liberacao",-1,1],["janela",2,2]]},
    {"po":"4500908140","seg":[["pedido",-40,-28],["embarque",-28,-27],["navio",-27,2,"delay"],["liberacao",2,4],["janela",5,5]],"note":"navio 4 dias atrasado; ETA em 2 dias"},
    {"po":"4500909012","seg":[["pedido",-20,-12],["embarque",-12,-11],["navio",-11,14],["liberacao",14,16],["janela",17,17]]},
    {"po":"4500909377","seg":[["pedido",-18,-9],["embarque",-9,-8],["navio",-8,21,"crit"],["liberacao",21,23],["janela",24,24]],"note":"navio 9 dias atrasado; produção de novembro em risco"},
    {"po":"4500909900","seg":[["pedido",-8,3],["embarque",3,4],["navio",4,31],["liberacao",31,33],["janela",34,34]]},
    {"po":"4500910245","seg":[["pedido",-2,8],["embarque",8,9],["navio",9,37],["liberacao",37,39],["janela",40,40]]},
    {"po":"4500921104","seg":[["pedido",-6,-1],["confirma",-1,0],["janela",0,0]],"note":"solicitado hoje, 16:00"},
    {"po":"4500919877","seg":[["pedido",-12,-1,"crit"]],"note":"prazo venceu ontem; fornecedor sem confirmação"},
    {"po":"4500922310","seg":[["pedido",-4,1],["confirma",1,3],["janela",3,3]]},
    {"po":"4500922877","seg":[["pedido",0,2],["confirma",2,4],["janela",4,4]],"note":"PO de hoje, já visível para o fornecedor"}]'::jsonb) loop
    for seg in select * from jsonb_array_elements(hz->'seg') loop
      insert into public.ib_horizon (tenant_id, po_id, stage, starts_on, ends_on, flag, note)
      values (t, (po_ids->>(hz->>'po'))::uuid, seg->>0, current_date + (seg->>1)::int, current_date + (seg->>2)::int, seg->>3,
        case when seg->>0 = 'janela' then hz->>'note' else null end);
    end loop;
  end loop;

  -- capacidade (pallets/dia) para os próximos 8 dias úteis
  i := 0;
  foreach dur in array array[1240, 1410, 1520, 1380, 1190, 980, 1050, 1120] loop
    insert into public.ib_capacity (tenant_id, plant_id, day, capacity_pallets, demand_pallets) values (t, pl, app.biz_day(i), 1600, dur);
    i := i + 1;
  end loop;

  -- regras da planta
  insert into public.ib_rules (tenant_id, plant_id, key, value, description) values
    (t, pl, 'windows_per_supplier_per_day', '2', 'Janelas por fornecedor por dia (padrão; por fornecedor na ficha)'),
    (t, pl, 'min_lead_hours', '24', 'Antecedência mínima para agendar'),
    (t, pl, 'cutoff_time', '"16:00"', 'Corte para agendar o dia seguinte'),
    (t, pl, 'no_show_minutes', '30', 'Minutos após a janela para registrar no-show'),
    (t, pl, 'priority_rule', '{"free_time_le1":40,"free_time_le3":20,"coverage_le2":35,"coverage_le4":15,"coverage_ge10":-15,"po_overdue":20}', 'Pesos da prioridade v1 (free time, cobertura, prazo)'),
    (t, pl, 'checkin_link_hours_before', '3', 'Horas antes da janela para enviar o link de check-in ao motorista');

  -- identidades externas (fornecedores fictícios; vinculam ao cadastrar com este e-mail)
  insert into public.external_identities (tenant_id, kind, entity_id, email, name, inactivity_days)
  values
    (t, 'supplier', (sup_ids->>'QS')::uuid, 'carla.menezes@quimicaserrana.exemplo', 'Carla Menezes', 60),
    (t, 'supplier', (sup_ids->>'PJ')::uuid, 'douglas.ferraz@plasticosjundia.exemplo', 'Douglas Ferraz', 60),
    (t, 'broker', (sup_ids->>'BA')::uuid, 'ricardo.sa@despachoatlantico.exemplo', 'Ricardo Sá', 60)
  on conflict (tenant_id, email) do update set entity_id = excluded.entity_id, status = 'active';

  -- FAQ do tenant
  delete from public.faq_items where tenant_id = t;
  insert into public.faq_items (tenant_id, solution, question, answer, tags) values
    (t, 'inbound360', 'Como o fornecedor agenda uma entrega?', 'No portal do fornecedor: informe a PO, escolha o tipo de carga e uma janela livre. A PO é validada contra a extração diária do SAP; PO repetida é bloqueada.', array['portal','agendamento']),
    (t, 'inbound360', 'Por que a janela sugerida não é a primeira livre?', 'A prioridade v1 pesa free time do contêiner, cobertura de estoque e prazo da PO. A regra e os pesos ficam em Configurações → Regras.', array['prioridade']),
    (t, 'inbound360', 'O que acontece se o caminhão não chegar?', 'Trinta minutos após a janela sem check-in ou leitura na portaria, o agendamento vira no-show, o fornecedor é notificado e a doca fica livre para a fila.', array['no-show','portaria']),
    (t, 'inbound360', 'Como funciona o check-in do motorista?', 'Três horas antes da janela o motorista recebe um link. Ele confirma que está a caminho e compartilha a posição; a portaria já sabe quem vai chegar, mesmo se o sinal cair perto da planta.', array['motorista','check-in']),
    (t, 'inbound360', 'De onde vêm as POs e a cobertura de estoque?', 'De uma extração diária do SAP, entregue pelo time de digital. Nada é integrado em tempo real nem gravado de volta no SAP.', array['sap','dados']);

  return 'seed ok · tenant ' || p_slug || ' · dia útil base ' || to_char(d0, 'DD/MM/YYYY');
end $$;

-- Guias e FAQ comuns da plataforma (tenant_id null)
insert into public.faq_items (tenant_id, solution, question, answer, tags) values
  (null, 'core', 'Não consigo entrar com meu e-mail pessoal', 'Por governança, só e-mail corporativo é aceito. Peça ao administrador da sua empresa um convite para o seu e-mail de trabalho.', array['acesso']),
  (null, 'core', 'Esqueci a senha', 'Na tela de login, clique em "Esqueci a senha". O link de redefinição chega por e-mail e vale por uma hora.', array['acesso','senha']),
  (null, 'core', 'O que é a barra vermelha no topo?', 'Aviso de pendência financeira do tenant. Os prazos de aviso, barra e bloqueio ficam em Configurações → Danger zone.', array['billing'])
on conflict do nothing;

insert into public.guides (solution, route, title, body_md, sort) values
  ('inbound360', '/app/hoje', 'Hoje nas docas', 'Grade de docas do dia. Cada bloco é um agendamento; a cor é o status. Clique para abrir o detalhe, mover ou recusar. A fila da direita lista as solicitações com a prioridade sugerida.', 10),
  ('inbound360', '/app/chegadas', 'Chegadas', 'Tudo que chega nas próximas horas, na ordem da janela, com previsão de chegada e status da portaria.', 20),
  ('inbound360', '/app/portaria', 'Portaria e pátio', 'Leitura de placa, conferência com o agendamento, evidência com hora e chamada para a doca. As vagas do pátio mostram quem está esperando e há quanto tempo.', 30),
  ('inbound360', '/app/horizonte', 'Horizonte 60 dias', 'Linha do tempo por PO, do pedido à janela. Navio atrasado aparece em alerta. Abaixo, a capacidade da planta por dia.', 40),
  ('inbound360', '/app/zeus', 'Zeus', 'Pergunte em português. Toda resposta traz a fonte e a hora do dado.', 50),
  ('inbound360', '/portal', 'Portal do fornecedor', 'Entre com o e-mail da empresa. Agende com a PO, escolha o tipo de carga e a janela. Reagende ou cancele até o corte.', 60),
  ('core', '/config/usuarios', 'Usuários e perfis', 'Convide por e-mail corporativo, defina o perfil (admin, operador, leitura, externo) e desative em um clique. Identidades externas expiram por inatividade.', 100),
  ('core', '/config/danger', 'Danger zone', 'Parâmetros de inadimplência (aviso, barra, bloqueio), encerramento do tenant e exportação de dados. Ações irreversíveis pedem confirmação por texto.', 110)
on conflict (solution, route) do update set body_md = excluded.body_md, title = excluded.title;
