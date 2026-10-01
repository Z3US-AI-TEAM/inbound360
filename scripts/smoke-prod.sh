#!/usr/bin/env bash
# Prova de vida do front em produção + ponte com o Supabase.
# Uso: scripts/smoke-prod.sh [https://inbound.z3us.app]
set -u
BASE="${1:-https://inbound.z3us.app}"
SB_URL="${VITE_SUPABASE_URL:-https://hztrzamkedbacisrqmsa.supabase.co}"
SB_KEY="${VITE_SUPABASE_ANON_KEY:-sb_publishable_B2s-AH4QkDVCL2Uz6giyzw_60jVkaPR}"
fail=0
ok()   { printf '  ok   %s\n' "$1"; }
bad()  { printf '  FAIL %s\n' "$1"; fail=1; }

hdr() { curl -sS -o /dev/null -D - --max-time 25 "$1" 2>/dev/null; }
body() { curl -sS --max-time 25 "$1" 2>/dev/null; }

echo "front: $BASE"
h=$(hdr "$BASE/"); code=$(printf '%s' "$h" | head -1 | awk '{print $2}')
[ "$code" = "200" ] && ok "/ responde 200" || bad "/ respondeu $code"
b=$(body "$BASE/")
printf '%s' "$b" | grep -q '<div id="root">' && ok "/ entrega o index do SPA" || bad "/ não é o index do SPA (placeholder da Hostinger?)"
printf '%s' "$h" | grep -qi 'cache-control: .*no-cache' && ok "index.html sem cache" || bad "index.html sem cabeçalho no-cache (.htaccess não aplicado?)"
for p in /login /t/pg /inbound/hoje; do
  c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 "$BASE$p" 2>/dev/null)
  bb=$(body "$BASE$p")
  if [ "$c" = "200" ] && printf '%s' "$bb" | grep -q '<div id="root">'; then ok "$p cai no SPA (fallback do .htaccess)"; else bad "$p respondeu $c sem o SPA"; fi
done
js=$(printf '%s' "$b" | grep -o '/assets/[A-Za-z0-9_-]*\.js' | head -1)
if [ -n "$js" ]; then
  jh=$(hdr "$BASE$js"); jc=$(printf '%s' "$jh" | head -1 | awk '{print $2}')
  [ "$jc" = "200" ] && ok "bundle $js servido" || bad "bundle $js respondeu $jc"
  printf '%s' "$jh" | grep -qi 'cache-control: .*immutable' && ok "bundle com cache longo" || bad "bundle sem cache longo"
  body "$BASE$js" | grep -q "$SB_URL" && ok "bundle aponta para $SB_URL" || bad "bundle não aponta para o Supabase esperado"
else
  bad "nenhum bundle JS referenciado no index"
fi
c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 "$BASE/.htaccess" 2>/dev/null)
[ "$c" = "403" ] || [ "$c" = "404" ] && ok ".htaccess não exposto ($c)" || bad ".htaccess exposto ($c)"

echo "supabase: $SB_URL"
r=$(curl -sS --max-time 25 "$SB_URL/rest/v1/tenant_public?slug=eq.pg&select=slug,name,brand_mode,accent_color" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" 2>/dev/null)
printf '%s' "$r" | grep -q '"slug":"pg"' && ok "tenant_public devolve a marca do tenant pg para anon" || bad "tenant_public não devolveu o tenant pg: $r"
r=$(curl -sS --max-time 25 "$SB_URL/rest/v1/tenants?select=id" -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" 2>/dev/null)
[ "$r" = "[]" ] && ok "tenants vazio para anon (RLS)" || bad "tenants vazou para anon: $r"
c=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 25 -X POST "$SB_URL/functions/v1/zeus" -H "apikey: $SB_KEY" -H "Content-Type: application/json" -d '{}' 2>/dev/null)
[ "$c" = "401" ] && ok "zeus exige JWT (401 sem login)" || bad "zeus sem JWT respondeu $c"
r=$(curl -sS --max-time 25 "$SB_URL/auth/v1/settings" -H "apikey: $SB_KEY" 2>/dev/null)
printf '%s' "$r" | grep -q '"disable_signup":false' && ok "cadastro por e-mail corporativo habilitado (o trigger app.handle_new_user barra e-mail pessoal)" || bad "cadastro desligado: o fluxo de convite depende de signUp"
printf '%s' "$r" | grep -q '"mailer_autoconfirm":false' && ok "confirmação de e-mail exigida" || bad "autoconfirm ligado: e-mail não é verificado"

[ $fail -eq 0 ] && echo "prova de vida: tudo verde" || { echo "prova de vida: há falhas acima"; exit 1; }
