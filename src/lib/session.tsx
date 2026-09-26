import * as React from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, TENANT_SLUG } from "./supabase";

export type Role = "tenant_admin" | "operator" | "viewer" | "external" | null;

export interface TenantPublic {
  slug: string; name: string; product_name: string; brand_mode: "z3us" | "white"; accent_color: string | null; logo_url: string | null; demo: boolean;
  identity: Record<string, string> | null;
}
export interface Tenant extends TenantPublic {
  id: string; legal_name: string | null; email_domains: string[]; status: string; solution: string;
}
export interface Profile { id: string; email: string; full_name: string | null; is_platform_admin: boolean }
export interface AccessState { mode: "ok" | "warn" | "bar" | "blocked"; days: number | null; warn_days?: number; bar_days?: number; block_days?: number; overdue_since?: string; reason?: string }

interface Ctx {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  tenantPublic: TenantPublic | null;
  tenant: Tenant | null;
  settings: { identity: Record<string, any>; params: Record<string, any>; danger: Record<string, any> } | null;
  role: Role;
  isAdmin: boolean;          // admin do tenant ou da plataforma
  canWrite: boolean;         // admin ou operador
  isExternal: boolean;
  access: AccessState;
  externalEntityIds: string[];
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionCtx = React.createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [session, setSession] = React.useState<Session | null>(null);
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [tenantPublic, setTenantPublic] = React.useState<TenantPublic | null>(null);
  const [tenant, setTenant] = React.useState<Tenant | null>(null);
  const [settings, setSettings] = React.useState<Ctx["settings"]>(null);
  const [role, setRole] = React.useState<Role>(null);
  const [access, setAccess] = React.useState<AccessState>({ mode: "ok", days: 0 });
  const [externalEntityIds, setExternalEntityIds] = React.useState<string[]>([]);

  const loadPublic = React.useCallback(async () => {
    const { data } = await supabase.from("tenant_public").select("*").eq("slug", TENANT_SLUG).maybeSingle();
    if (data) setTenantPublic(data as TenantPublic);
  }, []);

  const loadPrivate = React.useCallback(async (u: User | null) => {
    if (!u) { setProfile(null); setTenant(null); setSettings(null); setRole(null); setExternalEntityIds([]); return; }
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from("profiles").select("id,email,full_name,is_platform_admin").eq("id", u.id).maybeSingle(),
      supabase.from("tenants").select("*").eq("slug", TENANT_SLUG).maybeSingle(),
    ]);
    setProfile((p as Profile) || null);
    if (t) {
      const tn = t as Tenant;
      setTenant(tn);
      const [{ data: s }, { data: m }, { data: a }, { data: ex }] = await Promise.all([
        supabase.from("tenant_settings").select("identity,params,danger").eq("tenant_id", tn.id).maybeSingle(),
        supabase.from("memberships").select("role,status").eq("tenant_id", tn.id).eq("user_id", u.id).maybeSingle(),
        supabase.rpc("access_state", { t: tn.id }).then((r) => r, () => ({ data: null })),
        supabase.from("external_identities").select("entity_id").eq("tenant_id", tn.id).eq("user_id", u.id).eq("status", "active"),
      ]);
      setSettings((s as any) || { identity: {}, params: {}, danger: {} });
      const mm = m as { role: Role; status: string } | null;
      setRole(mm && mm.status === "active" ? mm.role : (p as Profile)?.is_platform_admin ? "tenant_admin" : null);
      if (a) setAccess(a as AccessState);
      setExternalEntityIds(((ex as any[]) || []).map((x) => x.entity_id).filter(Boolean));
      supabase.rpc("touch_presence", { t: tn.id }).then(() => {}, () => {});
    } else {
      setTenant(null); setRole(null);
    }
  }, []);

  const refresh = React.useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    const timeout = new Promise<void>((r) => setTimeout(r, 6000));
    await Promise.race([Promise.allSettled([loadPublic(), loadPrivate(data.session?.user ?? null)]), timeout]);
  }, [loadPublic, loadPrivate]);

  React.useEffect(() => {
    let alive = true;
    (async () => { try { await refresh(); } finally { if (alive) setLoading(false); } })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      loadPrivate(s?.user ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [refresh, loadPrivate]);

  const signOut = React.useCallback(async () => { await supabase.auth.signOut(); setSession(null); await loadPrivate(null); }, [loadPrivate]);

  const isPlatform = !!profile?.is_platform_admin;
  const value: Ctx = {
    loading, session, user: session?.user ?? null, profile, tenantPublic, tenant, settings, role,
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
    if (tenantPublic?.product_name) document.title = `${tenantPublic.product_name} · ${tenantPublic.name}`;
  }, [tenantPublic]);
}
