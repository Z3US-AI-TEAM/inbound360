# Subida para produção · inbound.z3us.app

Sequência curta, na ordem. Cada passo diz quem faz.

## 0. Destravar (Herbert, 5 minutos)
1. **GitHub**: o app "Claude" (conector GitHub) já enxerga o `inbound360` (feito em 01/10/2026). O `git push` com o histórico assinado passa por outro caminho: o proxy de git da sessão só injeta credencial para repositórios listados nas **fontes da sessão** ("add the repository to the session's sources"). Então: na sessão do Claude (ou numa tarefa nova), incluir `Z3US-AI-TEAM/inbound360` como fonte/repositório; aí `git fetch origin main && git push origin main` sobe tudo. Cópias com o histórico completo em `#Z3US.AI\Contas\P&G\dev\`: `inbound360_repo_2026-10-01.tar.gz` (pasta com `.git`) e `inbound360_main_2026-10-01.bundle` (`git clone inbound360_main_2026-10-01.bundle inbound360` recria o repositório; depois `git remote set-url origin https://github.com/Z3US-AI-TEAM/inbound360.git`).
2. **Supabase**: criar o projeto `Z3US Plataforma` (org Oliv Solutions, região `sa-east-1`, Pro) pelo dashboard, ou entrar no dashboard dentro do navegador do app Claude para que o Atlas crie. O conector trava na criação (timeout de 180 s, 4 tentativas em 30/09).
3. **Hostinger**: hPanel logado no navegador do app Claude (o conector Hostinger está sem autorização, 401). Feito em 01/10/2026.
4. **Segredos** (só no painel do Supabase, Edge Functions → Secrets): `ANTHROPIC_API_KEY`, `RESEND_API_KEY`; opcionais `NOTIFY_FROM`, `ZEUS_MODEL`.

## Estado em 01/10/2026
- Supabase: projeto **Z3US Plataforma** `hztrzamkedbacisrqmsa` (sa-east-1, Pro, Micro) criado pelo dashboard (o conector trava na criação e em qualquer SQL com DROP/DELETE de nível superior, que ele tenta confirmar e não consegue). As 6 migrations foram aplicadas por `execute_sql` em blocos; seed `pg` rodado; `zeus` e `notify` publicadas com `verify_jwt`. URL `https://hztrzamkedbacisrqmsa.supabase.co`, chave pública `sb_publishable_B2s-AH4QkDVCL2Uz6giyzw_60jVkaPR` (vai no front; a service role fica só nas Edge Functions, injetada pelo Supabase). A tabela `supabase_migrations.schema_migrations` está vazia: antes de um `supabase db push` futuro, marcar as migrations já aplicadas com `supabase migration repair --status applied <versão>`.
- Hostinger: site **inbound.z3us.app** criado em 01/10/2026 no plano Cloud Startup (Sites → Criar site → Site PHP/HTML → subdomínio gratuito do z3us.app, cujo DNS já é da Hostinger: ns1/ns2.dns-parking.com). O DNS do subdomínio e o certificado foram emitidos sozinhos; HTTP redireciona para HTTPS. O front subiu pelo fluxo "Carregar arquivos do site" com `release/inbound360_dist_20261001-1410.zip`; a Hostinger descompactou na raiz pública (`public_html`), `.htaccess` incluso. Prova de vida verde (`scripts/smoke-prod.sh`).
- Front no ar: `/login` neutro, `/t/pg` com a marca do tenant, rotas protegidas caem em `/login?next=...`, 404 próprio do app.
- Pendente do Herbert: segredos `ANTHROPIC_API_KEY` e `RESEND_API_KEY`; SMTP custom; acesso do app Claude ao repositório (push); primeiro acesso (seção 6).

## Como atualizar o front (depois desta primeira subida)
Versão corrente: `release/inbound360_dist_20261001-1945.zip` (Gestão Z3US). Enquanto o push ao GitHub não destrava, a subida é por zip; depois, o plano é hPanel → Avançado → Git puxando um branch `deploy` com o `dist` pronto (webhook de auto-deploy), e aí subir versão vira push.
1. `VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... scripts/build-release.sh` gera um zip novo.
2. hPanel → site inbound.z3us.app → Gerenciador de arquivos → `public_html` → enviar o zip → extrair → apagar o zip. A `.htaccess` do zip substitui a anterior. O seletor de arquivos do Windows é sempre um clique do Herbert; o Atlas não o opera.
3. `scripts/smoke-prod.sh` depois de cada subida.
Opção B (quando o push ao GitHub estiver liberado): hPanel → Web app Node.js a partir do GitHub, build `npm run build`, pasta `dist`, variáveis `VITE_*`; aí a subida vira push.

## 1. Banco (Atlas, 10 minutos)
Aplicar as migrations na ordem, com `apply_migration`:
`20260926000100_core` → `20260926000200_inbound360` → `20260926000300_units_gates_billing` → `20260926000400_links_and_seed` → `20260926000500_public_rpc`.
Depois `select app.ib_seed_demo('pg');` (tenant P&G de demonstração, unidade LOU, portarias P1 e P2) e `get_advisors(security)` para conferir RLS.

## 2. Edge Functions (Atlas, 5 minutos)
`zeus` e `notify` com `verify_jwt = true` (as duas validam o usuário pelo JWT e o papel no tenant via `my_role`).

## 3. Auth (Herbert ou Atlas no painel, 5 minutos)
Ver `docs/OPERACAO.md`: Site URL, Redirect URLs, senha mínima, SMTP custom com Resend. Convites para a P&G saem só depois do SMTP.

## 4. Front (Atlas, 5 minutos)
`VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... scripts/build-release.sh` → `release/inbound360_dist_<data>.zip` (inclui `.htaccess` com fallback do SPA).
Hostinger: site/subdomínio `inbound.z3us.app` → File Manager → enviar o zip para a raiz pública e extrair → HTTPS ativo → DNS `inbound` apontando para a hospedagem.
Opção B (sem zip): hPanel → Node.js app a partir do GitHub, build `npm run build`, pasta `dist`, variáveis `VITE_*`.

## 5. Prova de vida (Atlas, 5 minutos)
- `scripts/smoke-prod.sh` (front + Supabase). Feito em 01/10/2026: tudo verde.
- `https://inbound.z3us.app/login` abre, neutro; `https://inbound.z3us.app/t/pg` abre com a marca do tenant.
- Login com um e-mail corporativo convidado; e-mail pessoal é recusado pelo trigger `app.handle_new_user`.
- Hoje nas docas carrega o seed; Zeus responde com fonte e hora (precisa de `ANTHROPIC_API_KEY`).
- Convite de teste pelo Configurações → Usuários (precisa de `RESEND_API_KEY`).

## 6. Primeiro acesso (decisão do Herbert)
`profiles.is_platform_admin` nasce `false` e a lista de tenants vem só de `memberships`; sem bootstrap, quem se cadastra vê o login funcionar e nenhum tenant. A migration `20260926000700_bootstrap_admins.sql` cria a lista interna `app.bootstrap_admins` (hoje só `herbert@z3us.ai` → admin da plataforma + `tenant_admin` do tenant `pg`) e o cadastro aplica isso sozinho (`app.apply_bootstrap`, chamada pelo trigger `on_auth_user_created`). Conceder admin é decisão de dono: o Herbert mandou "aplica o bootstrap" em 01/10/2026 e o Atlas aplicou pelo conector. Fluxo do primeiro acesso: `/t/pg` → "Criar conta com e-mail corporativo" → confirmar o e-mail (o SMTP padrão do Supabase entrega poucos e-mails por hora; o custom com Resend vem na sequência) → entrar. Outros admins (Rodrigo) entram por uma linha nova na lista (`insert into app.bootstrap_admins ...`, só pelo postgres) ou por Configurações → Usuários depois que o primeiro admin existir.

Convites e identidades externas ligam sozinhos pelo e-mail (migration `20260926000800_signup_autolink.sql`, aplicada em 01/10/2026): convite pendente vira membership no cadastro, identidade externa ganha `user_id`, e convite criado para quem já tem conta liga na hora. Testado em dry run com rollback no banco de produção: bootstrap → `is_platform_admin` + `tenant_admin` em `pg`; convite `operator` → membership `operator` e convite aceito; identidade externa → vinculada.

O admin da plataforma (`is_platform_admin`) passa em `has_tenant`, `can_write` e `is_tenant_admin` de qualquer tenant, vê todos os tenants no seletor (`my_tenants`) e é o único que cria, suspende e encerra tenant.

## 7. Gestão Z3US (admin da plataforma)
Tela `/gestao` (menu lateral "Plataforma → Gestão Z3US", só para `is_platform_admin`): lista de tenants com status, marca, unidades, portarias, usuários, billing e último acesso; `/gestao/novo` cria o tenant em uma transação (`public.create_tenant(jsonb)`: tenant, settings, conta de billing, primeira unidade com portarias, itens de billing e convite do primeiro administrador, que entra sozinho no cadastro); `/gestao/:id` administra status (`public.set_tenant_status`), convites, conta e composição do billing (`set_billing_status`, `billing_accounts`, `billing_items`), unidades e portarias, e a trilha (`audit_log`). Backend na migration `20260926000900_platform_admin.sql`, aplicada em produção em 01/10/2026; percurso ponta a ponta validado no ambiente local com `scripts/gestao-walk.py` (capturas em `shots/gestao_*.png`).

## O que já está pronto
Repositório local com 6 commits (fundação, multi-tenant, ambiente de validação, fontes via npm, `.htaccess`, este runbook), build de produção validado localmente, 76 capturas tela a tela, showreel de 60 s. Cópia: `#Z3US.AI\Contas\P&G\dev\inbound360_fundacao_2026-09-26.tar.gz`.
