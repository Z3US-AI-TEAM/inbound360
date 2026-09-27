// API local para desenvolvimento sem Supabase: PostgREST em :3000 atrás de um proxy que imita
// os caminhos do Supabase (/rest/v1, /auth/v1 mínimo). Uso: node scripts/local-api.mjs
import http from "node:http";
import crypto from "node:crypto";

const SECRET = process.env.PGRST_JWT_SECRET || "z3us-local-development-secret-with-32-chars!!";
const PORT = Number(process.env.LOCAL_API_PORT || 8787);
const PGRST = "http://127.0.0.1:3000";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sign(claims) {
  const h = b64({ alg: "HS256", typ: "JWT" }); const p = b64(claims);
  const s = crypto.createHmac("sha256", SECRET).update(h + "." + p).digest("base64url");
  return `${h}.${p}.${s}`;
}
function decode(tok) { try { return JSON.parse(Buffer.from(tok.split(".")[1], "base64url").toString()); } catch { return null; } }
function userFrom(claims) { return { id: claims.sub, aud: "authenticated", role: "authenticated", email: claims.email, email_confirmed_at: new Date(0).toISOString(), app_metadata: { provider: "email" }, user_metadata: { full_name: claims.full_name || "" }, created_at: new Date(0).toISOString() }; }
function sessionFor(claims) { const exp = Math.floor(Date.now() / 1000) + 3600 * 24; const c = { ...claims, role: "authenticated", aud: "authenticated", exp }; return { access_token: sign(c), token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "refresh-" + claims.sub, user: userFrom(c) }; }

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info, range, accept-profile, content-profile, x-supabase-api-version", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS", "access-control-expose-headers": "content-range, range" };

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, "http://x");
  const auth = (req.headers.authorization || "").replace(/^Bearer /, "");
  const claims = decode(auth);
  if (url.pathname.startsWith("/auth/v1/")) {
    const p = url.pathname.slice("/auth/v1/".length);
    if (p === "user" && claims?.sub) { res.writeHead(200, { ...CORS, "content-type": "application/json" }); return res.end(JSON.stringify(userFrom(claims))); }
    if (p === "token") { let body = ""; for await (const c of req) body += c; const j = body ? JSON.parse(body) : {};
      const sub = (j.refresh_token || "").replace("refresh-", "") || claims?.sub;
      const email = claims?.email || global.__users?.[sub] || "";
      if (!sub) { res.writeHead(400, CORS); return res.end(JSON.stringify({ error: "invalid_grant" })); }
      res.writeHead(200, { ...CORS, "content-type": "application/json" }); return res.end(JSON.stringify(sessionFor({ sub, email }))); }
    if (p === "logout") { res.writeHead(204, CORS); return res.end(); }
    res.writeHead(404, { ...CORS, "content-type": "application/json" }); return res.end(JSON.stringify({ error: "auth local não implementa " + p }));
  }
  if (url.pathname.startsWith("/functions/v1/")) { res.writeHead(503, { ...CORS, "content-type": "application/json" }); return res.end(JSON.stringify({ error: "Edge Functions indisponíveis no ambiente local" })); }
  if (url.pathname.startsWith("/rest/v1/")) {
    const target = PGRST + url.pathname.slice("/rest/v1".length) + url.search;
    const headers = { ...req.headers }; delete headers.host; delete headers.apikey; delete headers["x-client-info"];
    let body = ""; for await (const c of req) body += c;
    try {
      const r = await fetch(target, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body });
      const out = Buffer.from(await r.arrayBuffer());
      if (r.status >= 400) console.log(r.status, req.method, url.pathname + url.search.slice(0, 200), out.toString().slice(0, 300));
      const h = { ...CORS }; for (const [k, v] of r.headers) if (!["content-encoding", "transfer-encoding", "connection"].includes(k)) h[k] = v;
      res.writeHead(r.status, h); return res.end(out);
    } catch (e) { res.writeHead(502, CORS); return res.end(String(e)); }
  }
  res.writeHead(404, CORS); res.end("not found");
});
server.listen(PORT, "127.0.0.1", () => console.log(`API local em http://127.0.0.1:${PORT} → PostgREST ${PGRST}`));
