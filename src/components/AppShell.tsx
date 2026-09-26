import * as React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LayoutGrid, Truck, DoorOpen, Mountain, Zap, SlidersHorizontal, Waves, Tv, Settings, Sun, Moon, LogOut, Clock as ClockIcon, Menu, X, LifeBuoy, BookOpen } from "lucide-react";
import { Z3Logo } from "./Z3Logo";
import { TenantLogo } from "./TenantLogo";
import { DangerBar } from "./DangerBar";
import { useSession } from "@/lib/session";
import { trackView } from "@/lib/engagement";
import { cn, fmtDia, pad } from "@/lib/utils";
import { Tip } from "./ui/misc";

const NAV = [
  { to: "/app/hoje", label: "Hoje nas docas", icon: LayoutGrid },
  { to: "/app/chegadas", label: "Chegadas", icon: Truck },
  { to: "/app/portaria", label: "Portaria e pátio", icon: DoorOpen, onda: "C" },
  { to: "/app/horizonte", label: "Horizonte 60 dias", icon: Mountain, onda: "B" },
  { to: "/app/zeus", label: "Zeus", icon: Zap },
  { to: "/app/regras", label: "Regras", icon: SlidersHorizontal },
  { to: "/app/ondas", label: "Roteiro das ondas", icon: Waves },
];

export function useTheme() {
  const [dark, setDark] = React.useState(() => document.documentElement.getAttribute("data-theme") !== "light");
  const toggle = React.useCallback(() => {
    const next = !dark; setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    try { localStorage.setItem("z3_theme", next ? "dark" : "light"); } catch { /* ignore */ }
  }, [dark]);
  return { dark, toggle };
}

export function Clock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  return (
    <span className="mono inline-flex items-center gap-2 text-[12.5px] text-ink-2">
      <ClockIcon className="size-3.5" aria-hidden />
      <b className="font-medium text-ink">{pad(now.getHours())}:{pad(now.getMinutes())}</b> {fmtDia(now)}
    </span>
  );
}

export function AppShell() {
  const { tenantPublic, profile, signOut, isAdmin, isExternal, tenant, user } = useSession();
  const { dark, toggle } = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => { if (tenant) trackView(tenant.id, user?.id ?? null, loc.pathname); setOpen(false); }, [loc.pathname, tenant, user]);

  const product = tenantPublic?.product_name || "Inbound 360";
  const showZ3 = tenantPublic?.brand_mode !== "white";

  return (
    <div className="min-h-screen flex flex-col">
      <DangerBar />
      <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur border-t-[3px] border-t-brand">
        <div className="flex items-center gap-3 px-3 md:px-4 h-[60px]">
          <button className="md:hidden p-2 -ml-1 rounded-sm hover:bg-surface-3" onClick={() => setOpen((v) => !v)} aria-label="Menu">{open ? <X className="size-5" /> : <Menu className="size-5" />}</button>
          {showZ3 ? <Z3Logo className="h-[30px] w-auto text-ink" /> : <TenantLogo size={34} />}
          <div className="hidden sm:block h-8 w-px bg-line-strong" />
          <div className="min-w-0 leading-tight">
            <div className="text-[17px] font-bold tracking-tight truncate">{product}</div>
            <div className="text-[11.5px] text-muted font-semibold uppercase tracking-[.04em] truncate">
              {showZ3 ? <>OLIMPO 360 com <span className="text-brand-ink">Zeus</span></> : <>tecnologia Z3US.AI</>}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2.5 ml-2">
            {showZ3 && <TenantLogo size={36} />}
            <div className="leading-tight">
              <div className="text-[14px] font-bold">{tenantPublic?.name?.split("·").slice(-1)[0].trim()}</div>
              <div className="text-[11px] text-muted font-semibold uppercase tracking-[.04em]">inbound · recebimento</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden lg:inline-flex"><Clock /></span>
            {!isExternal && (
              <div className="hidden sm:inline-flex rounded-full bg-surface-2 border border-line p-0.5">
                <NavLink to="/app/hoje" className={({ isActive }) => cn("rounded-full px-3 py-1.5 text-[13px] font-semibold", isActive || loc.pathname.startsWith("/app") ? "bg-surface-3 text-ink" : "text-ink-2")}>Planta</NavLink>
                <NavLink to="/portal" className={({ isActive }) => cn("rounded-full px-3 py-1.5 text-[13px] font-semibold", isActive ? "bg-surface-3 text-ink" : "text-ink-2")}>Fornecedor</NavLink>
                <NavLink to="/tv" className={({ isActive }) => cn("rounded-full px-3 py-1.5 text-[13px] font-semibold inline-flex items-center gap-1.5", isActive ? "bg-surface-3 text-ink" : "text-ink-2")}><Tv className="size-3.5" />TV da doca</NavLink>
              </div>
            )}
            <Tip content={dark ? "Tema claro" : "Tema Z3US"}>
              <button onClick={toggle} className="h-9 w-9 grid place-items-center rounded-full border border-line-strong hover:bg-surface-3" aria-label="Alternar tema">{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
            </Tip>
            {tenantPublic?.demo && <span className="hidden md:inline-flex items-center rounded-full border border-dashed border-line-strong px-2.5 py-1 text-xs font-semibold text-ink-2">Demonstração · dados fictícios</span>}
            <Tip content="Sair">
              <button onClick={() => { void signOut().then(() => nav("/login")); }} className="h-9 w-9 grid place-items-center rounded-full border border-line-strong hover:bg-surface-3" aria-label="Sair"><LogOut className="size-4" /></button>
            </Tip>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {!isExternal && (
          <aside className={cn("fixed md:static inset-y-0 left-0 z-20 w-[248px] shrink-0 border-r border-line bg-bg pt-[64px] md:pt-0 transform transition-transform md:transform-none", open ? "translate-x-0" : "-translate-x-full md:translate-x-0")}>
            <div className="px-3 py-3 flex flex-col h-full">
              <div className="px-2.5 pt-2 pb-1">
                <div className="eyebrow">inbound</div>
                <div className="text-[14px] font-bold truncate">{profile?.full_name || profile?.email}</div>
              </div>
              <nav className="mt-2 space-y-0.5">
                {NAV.map((n) => (
                  <NavLink key={n.to} to={n.to} className={({ isActive }) => cn("flex items-center gap-2.5 w-full rounded-sm px-2.5 py-2 text-[13.5px] font-semibold", isActive ? "bg-brand-tint text-brand-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink")}>
                    <n.icon className="size-4" />
                    <span className="truncate">{n.label}</span>
                    {n.onda && <span className="ml-auto text-[10px] font-bold tracking-[.04em] uppercase text-muted border border-line-strong rounded-full px-1.5">onda {n.onda}</span>}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-4 px-2.5 eyebrow">Suporte</div>
              <nav className="mt-1 space-y-0.5">
                <NavLink to="/config/chamados" className={({ isActive }) => cn("flex items-center gap-2.5 w-full rounded-sm px-2.5 py-2 text-[13.5px] font-semibold", isActive ? "bg-brand-tint text-brand-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink")}><LifeBuoy className="size-4" />Chamados e FAQ</NavLink>
                <NavLink to="/config/guias" className={({ isActive }) => cn("flex items-center gap-2.5 w-full rounded-sm px-2.5 py-2 text-[13.5px] font-semibold", isActive ? "bg-brand-tint text-brand-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink")}><BookOpen className="size-4" />Guias de uso</NavLink>
                {isAdmin && <NavLink to="/config" end className={({ isActive }) => cn("flex items-center gap-2.5 w-full rounded-sm px-2.5 py-2 text-[13.5px] font-semibold", isActive || (loc.pathname.startsWith("/config") && !loc.pathname.includes("chamados") && !loc.pathname.includes("guias")) ? "bg-brand-tint text-brand-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink")}><Settings className="size-4" />Configurações</NavLink>}
              </nav>
              <div className="mt-auto px-2.5 pb-2 pt-4">
                <div className="text-[11px] text-muted font-semibold">tecnologia</div>
                <Z3Logo className="h-6 w-auto text-ink mt-1" />
              </div>
            </div>
          </aside>
        )}
        {open && <div className="fixed inset-0 z-10 bg-[var(--scrim)] md:hidden" onClick={() => setOpen(false)} />}
        <main className="flex-1 min-w-0 px-4 md:px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
