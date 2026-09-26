import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Role = "tenant_admin" | "operator" | "viewer" | "external" | null;

export interface TenantPublic {
  slug: string; name: string; product_name: string; brand_mode: "z3us" | "white"; accent_color: string | null; logo_url: string | null; demo: boolean;
  identity: Record<string, string> | null;
}
export interface Tenant extends TenantPublic {
  id: string; legal_name: string | null; email_domains: string[]; status: string; solution: string;
}
export interface TenantOption { id: string; slug: string; name: string; product_name: string; brand_mode: "z3us" | "white"; accent_color: string | null; logo_url: string | null; demo: boolean; role: Role }
export interface Plant { id: string; code: string; name: string; address: string | null; timezone: string; open_time: string; close_time: string; slot_minutes: number; no_show_minutes: number }
export interface Profile { id: string; email: string; full_name: string | null; is_platform_admin: boolean }
export interface AccessState { mode: "ok" | "warn" | "bar" | "blocked"; days: number | null; warn_days?: number; bar_days?: number; block_days?: number; overdue_since?: string; reason?: string }

interface Ctx {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tenantPublic: TenantPublic | null;   // marca na tela de login (link do tenant) ou do tenant escolhido
  tenants: TenantOption[];
  tenant: Tenant | null;
  setTenant: (id: string) => void;
  plants: Plant[];
  plant: Plant | null;
  setPlant: (id: string) => void;
  settings: { identity: Record<string, any>; params: Record<string, any>; danger: Record<string, any> } | null;
  role: Role;
  isAdmin: boolean;
  canWrite: boolean;
  isExternal: boolean;
  access: AccessState;
  externalEntityIds: string[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionCtx = React.createContext<Ctx | null>(null);
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };

/** slug do tenant para login com marca: /t/<slug> ou ?t=<slug> */
export function loginTenantSlug(): string | null {
  const m = /^\/t\/([a-z0-9-]+)/.exec(location.pathname); if (m) return m[1];
  return new URLSearchParams(location.search).get("t");
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [tenantPublic, setTenantPublic] = React.useState<TenantPublic | null>(null);
  const [tenants, setTenants] = React.useState<TenantOption[]>([]);
  const [tenant, setTenantState] = React.useState<Tenant | null>(null);
  const [plants, setPlants] = React.useState<Plant[]>([]);
  const [plant, setPlantState] = React.useState<Plant | null>(null);
  const [settings, setSettings] = React.useState<Ctx["settings"]>(null);
  const [role, setRole] = React.useState<Role>(null);
  const [access, setAccess] = React.useState<AccessState>({ mode: "ok", days: 0 });
  const [externalEntityIds, setExternalEntityIds] = React.useState<string[]>([]);

  const loadPublic = React.useCallback(async () => {
    const slug = loginTenantSlug();
    if (!slug) { setTenantPublic(null); return; }
    const { data } = await supabase.from("tenant_public").select("*").eq("slug", slug).maybeSingle();
    if (data) setTenantPublic(data as TenantPublic);
  }, []);

  const loadTenant = React.useCallback(async (u: User, opt: TenantOption, p: Profile | null) => {
    const { data: t } = await supabase.from("tenants").select("*").eq("id", opt.id).maybeSingle();
    if (!t) { setTenantState(null); setRole(null); return; }
    const tn = t as Tenant;
    setTenantState(tn);
    setTenantPublic({ slug: tn.slug, name: tn.name, product_name: tn.product_name, brand_mode: tn.brand_mode, accent_color: tn.accent_color, logo_url: tn.logo_url, demo: tn.demo, identity: null });
    ls.set("z3_tenant", tn.id);
    const [{ data: s }, { data: m }, { data: a }, { data: ex }, { data: pls }] = await Promise.all([
      supabase.from("tenant_settings").select("identity,params,danger").eq("tenant_id", tn.id).maybeSingle(),
      supabase.from("memberships").select("role,status,plant_ids").eq("tenant_id", tn.id).eq("user_id", u.id).maybeSingle(),
      supabase.rpc("access_state", { t: tn.id }).then((r) => r, () => ({ data: null })),
      supabase.from("external_identities").select("entity_id").eq("tenant_id", tn.id).eq("user_id", u.id).eq("status", "active"),
      supabase.from("ib_plants").select("*").eq("tenant_id", tn.id).order("name"),
    ]);
    setSettings((s as any) || { identity: {}, params: {}, danger: {} });
    const mm = m as { role: Role; status: string } | null;
    setRole(mm && mm.status === "active" ? mm.role : p?.is_platform_admin ? "tenant_admin" : null);
    if (a) setAccess(a as AccessState);
    setExternalEntityIds(((ex as any[]) || []).map((x) => x.entity_id).filter(Boolean));
    const list = (pls as Plant[]) || [];
    setPlants(list);
    const saved = ls.get("z3_plant_" + tn.id);
    setPlantState(list.find((x) => x.id === saved) || list[0] || null);
    supabase.rpc("touch_presence", { t: tn.id }).then(() => {}, () => {});
  }, []);

  const loadPrivate = React.useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); setTenantState(null); setTenants([]); setPlants([]); setPlantState(null); setSettings(null); setRole(null); setExternalEntityIds([]); return; }
    const [{ data: p }, { data: ts }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,is_platform_admin").eq("id", u.id).maybeSingle(),
      supabase.rpc("my_tenants"),
    ]);
    const prof = (p as Profile) || null; setProfile(prof);
    const opts = ((ts as TenantOption[]) || []);
    setTenants(opts);
    if (opts.length === 0) { setTenantState(null); setRole(null); return; }
    const wanted = loginTenantSlug(); const saved = ls.get("z3_tenant");
    const pick = opts.find((o) => o.slug === wanted) || opts.find((o) => o.id === saved) || opts[0];
    await loadTenant(u, pick, prof);
  }, [loadTenant]);

  const refresh = React.useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    const timeout = new Promise<void>((r) => setTimeout(r, 6000));
    await Promise.race([Promise.allSettled([loadPublic(), loadPrivate(data.session?.user ?? null)]), timeout]);
  }, [loadPublic, loadPrivate]);

  React.useEffect(() => {
    let alive = true;
    (async () => { try { await refresh(); } finally { if (alive) setLoading(false); } })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); void loadPrivate(s?.user ?? null); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [refresh, loadPrivate]);

  const setTenant = React.useCallback((id: string) => { const o = tenants.find((t) => t.id === id); if (o && session?.user) void loadTenant(session.user, o, profile); }, [tenants, session, profile, loadTenant]);
  const setPlant = React.useCallback((id: string) => { const p = plants.find((x) => x.id === id); if (p) { setPlantState(p); if (tenant) ls.set("z3_plant_" + tenant.id, id); } }, [plants, tenant]);
  const signOut = React.useCallback(async () => { await supabase.auth.signOut(); setSession(null); await loadPrivate(null); }, [loadPrivate]);

  const isPlatform = !!profile?.is_platform_admin;
  const value: Ctx = {
    loading, session, user: session?.user ?? null, profile, tenantPublic, tenants, tenant, setTenant, plants, plant, setPlant, settings, role,
    isAdmin: isPlatform || role === "tenant_admin",
    canWrite: isPlatform || role === "tenant_admin" || role === "operator",
    isExternal: role === "external",
    access, externalEntityIds, refresh, signOut,
  };
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = React.useContext(SessionCtx);
  if (!c) throw new Error("useSession fora do SessionProvider");
  return c;
}

/** Marca do tenant aplicada no :root (tema, acento) */
export function useApplyBrand() {
  const { tenantPublic } = useSession();
  React.useEffect(() => {
    const root = document.documentElement;
    const accent = tenantPublic?.brand_mode === "white" ? tenantPublic.accent_color : null;
    if (accent) {
      root.setAttribute("data-accent", "1");
      root.style.setProperty("--tenant-accent", accent);
      root.style.setProperty("--tenant-accent-ink", accent);
      root.style.setProperty("--tenant-accent-line", accent + "66");
      root.style.setProperty("--tenant-accent-tint", accent + "22");
    } else {
      root.removeAttribute("data-accent");
    }
    document.title = tenantPublic ? `${tenantPublic.product_name} · ${tenantPublic.name}` : "Inbound 360 · Z3US.AI";
  }, [tenantPublic]);
}
