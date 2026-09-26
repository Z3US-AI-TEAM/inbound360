import { supabase } from "./supabase";

let sessionId = "";
try { sessionId = sessionStorage.getItem("z3_sid") || ""; } catch { /* sem storage */ }
if (!sessionId) { sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36); try { sessionStorage.setItem("z3_sid", sessionId); } catch { /* ignore */ } }

let current: { tenant: string; user: string | null; path: string; since: number } | null = null;

async function flush(extra?: Partial<{ event: string; meta: Record<string, unknown> }>) {
  if (!current) return;
  const dur = Date.now() - current.since;
  const row = { tenant_id: current.tenant, user_id: current.user, session_id: sessionId, event: extra?.event || "page_view", path: current.path, duration_ms: Math.min(dur, 6 * 3600 * 1000), meta: extra?.meta || {} };
  try { await supabase.from("engagement_events").insert(row); } catch { /* engajamento nunca quebra a tela */ }
}

export function trackView(tenant: string, user: string | null, path: string) {
  if (current && current.path === path) return;
  void flush();
  current = { tenant, user, path, since: Date.now() };
}
export function trackAction(tenant: string, user: string | null, name: string, meta: Record<string, unknown> = {}) {
  void supabase.from("engagement_events").insert({ tenant_id: tenant, user_id: user, session_id: sessionId, event: "action", path: name, meta }).then(() => {}, () => {});
}
export function trackLogin(tenant: string, user: string | null) {
  void supabase.from("engagement_events").insert({ tenant_id: tenant, user_id: user, session_id: sessionId, event: "login", path: location.pathname }).then(() => {}, () => {});
}
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => { void flush(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void flush(); });
}
