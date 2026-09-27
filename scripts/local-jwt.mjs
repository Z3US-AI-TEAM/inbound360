// Emite tokens locais: node scripts/local-jwt.mjs anon | node scripts/local-jwt.mjs user <uuid> <email> [nome]
import crypto from "node:crypto";
const SECRET = process.env.PGRST_JWT_SECRET || "z3us-local-development-secret-with-32-chars!!";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (c) => { const h = b64({ alg: "HS256", typ: "JWT" }); const p = b64(c); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(h + "." + p).digest("base64url")}`; };
const [kind, sub, email, name] = process.argv.slice(2);
const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 30;
if (kind === "anon") console.log(sign({ role: "anon", iss: "local", exp }));
else {
  const c = { role: "authenticated", aud: "authenticated", sub, email, full_name: name || "", iss: "local", exp };
  console.log(JSON.stringify({ access_token: sign(c), token_type: "bearer", expires_in: 86400 * 30, expires_at: exp, refresh_token: "refresh-" + sub, user: { id: sub, aud: "authenticated", role: "authenticated", email, email_confirmed_at: new Date(0).toISOString(), app_metadata: { provider: "email" }, user_metadata: { full_name: name || "" }, created_at: new Date(0).toISOString() } }));
}
