# Inbound 360 · produto Z3US.AI (inbound.z3us.app)

Esteira de inbound (docas, gate e pátio) sobre a **plataforma Z3US**. Multi-tenant: o cliente é um tenant (ex.: P&G); dentro do tenant, as unidades (plantas), cada uma com portarias, docas, tipos de carga, regras e pátio. Unidade e portaria contam no billing. Camada externa por cima do SAP e do WMS: o fornecedor agenda com identidade própria, a PO é validada contra a extração diária do SAP, a prioridade vem de free time, cobertura de estoque e prazo, e a analista aprova, move e decide. Dados de demonstração fictícios.

Stack: Vite + React 18 + TypeScript + Tailwind + Radix + TanStack Query + Supabase (Postgres, Auth, Edge Functions) + Resend + Anthropic (Zeus).

## Mapa da solução

| Rota | Tela | Tabelas |
|---|---|---|
| `/login` e `/t/<slug>` | Login neutro do produto, ou com a marca do tenant pelo link dele; e-mail corporativo, código por e-mail para fornecedor, esqueci a senha, SSO quando configurado | auth, tenant_public, my_tenants() |
| `/app/hoje` | Grade de docas do dia, KPIs, fila de solicitações com prioridade v1, liberados do dia, alertas | ib_appointments_v, ib_releases, ib_purchase_orders_v |
| `/app/chegadas` | Chegadas na ordem da janela, previsão do motorista, status da portaria | ib_appointments_v |
| `/app/portaria` | Leitura de placa (Apolo), conferência, evidência, pátio com vagas e chamada para a doca | ib_gate_events, ib_yard_spots |
| `/app/horizonte` | Linha do tempo por PO (pedido → embarque → navio → liberação → janela) e capacidade | ib_horizon, ib_capacity |
| `/app/zeus` | Zeus com fonte e hora (Edge Function `zeus` + respostas locais) | ib_zeus_messages |
| `/app/regras` | Parâmetros da planta, tipos de carga, regras por fornecedor | ib_rules, ib_load_types, ib_suppliers |
| `/tv` | TV da doca | ib_appointments_v |
| `/portal` | Portal do fornecedor: agendar (PO → carga → dia e janela → veículo), meus agendamentos | ib_purchase_orders_v, ib_appointments |
| `/config/*` | Núcleo Z3US: usuários e perfis (acesso por unidade), identidade e marca (white label), unidades e portarias, cadastros, billing por unidade e portaria, engajamento, danger zone, chamados, FAQ, guias | tenants, memberships, invites, external_identities, tenant_settings, billing_*, engagement_events, tickets, faq_items, guides |

## Rodar

```bash
cp .env.example .env    # preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev             # http://localhost:8080
npm run build           # dist/ estático
```

Banco: `supabase/migrations/*.sql` na ordem (core → inbound360 → unidades/portarias/billing → links e seed → rpc). Depois, `select app.ib_seed_demo('pg');`.
Validação local sem Supabase: `scripts/db-local.sh` (Postgres local + stub de auth).

Edge Functions: `supabase/functions/zeus` (ANTHROPIC_API_KEY, ZEUS_MODEL opcional) e `supabase/functions/notify` (RESEND_API_KEY, NOTIFY_FROM). Segredos só no painel do Supabase.

## Primeiro acesso

1. Criar a conta em `/login` com e-mail corporativo (o servidor recusa e-mail pessoal).
2. Promover o primeiro admin (SQL, uma vez): `update public.profiles set is_platform_admin = true where email = '...'`.
3. Vincular ao tenant: `select public.grant_membership('email', 'pg', 'tenant_admin')` logado como admin, ou pela tela Configurações → Usuários. Login com a marca do cliente: `inbound.z3us.app/t/pg`.

## O que não faz, de propósito

Não substitui SAP nem WMS. Nenhuma integração com órgão público. Nenhum robô na portaria. Nenhum número de resultado antes de medir com dado real.
