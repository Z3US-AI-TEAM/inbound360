# Operação · checklist de subida

## Supabase (painel)
- Authentication → Providers → Email: confirmar e-mail ligado; senha mínima 12 e "letters, digits and symbols" (o app também valida).
- Authentication → URL configuration: Site URL `https://pg.z3us.app`; Redirect URLs `https://pg.z3us.app/login`, `https://pg.z3us.app/redefinir`.
- Authentication → SMTP: custom SMTP com Resend (host smtp.resend.com, porta 465, usuário `resend`, senha = API key), remetente em domínio verificado (hermes.z3us.ai). Sem isso, o SMTP padrão do Supabase limita a poucos e-mails por hora e o código do fornecedor pode não chegar na demo.
- Edge Functions → Secrets: `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `NOTIFY_FROM` (opcional), `ZEUS_MODEL` (opcional).
- Storage: bucket público `brand` (logo do cliente).
- Database → Extensions: `pg_cron` para `select app.expire_external_identities()` diário e `select app.ib_seed_demo('pg-louveira')` às 05:00 no tenant demo.

## Hostinger
- Site `pg.z3us.app`: build estático do Vite (`npm ci && npm run build`, pasta `dist`), SPA com fallback para `index.html`. Variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TENANT_SLUG=pg-louveira`.
- DNS: `pg` CNAME/A no domínio `z3us.app`; HTTPS ativo.
- `robots: noindex` já está no `index.html`.

## Demo na visita (30/09)
- Levar o HTML v0.2 offline como plano B: o sinal na planta é ruim.
- Contas: um admin da planta (e-mail @z3us.ai ou @pg.com), um fornecedor (Química Serrana) já logado no aparelho.
- Antes de sair: Configurações → Danger zone → "Regerar dados de demonstração para hoje".
