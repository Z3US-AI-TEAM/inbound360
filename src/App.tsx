import * as React from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useSession, useApplyBrand } from "./lib/session";
import { Spinner } from "./components/ui/misc";
import { AppShell } from "./components/AppShell";
import { BlockedScreen } from "./components/DangerBar";
import { LoginPage } from "./pages/Login";
import { ResetPage, PrivacyPage, NotFound, NoAccess } from "./pages/Misc";

const Hoje = React.lazy(() => import("./modules/inbound/Hoje"));
const Chegadas = React.lazy(() => import("./modules/inbound/Chegadas"));
const Portaria = React.lazy(() => import("./modules/inbound/Portaria"));
const Horizonte = React.lazy(() => import("./modules/inbound/Horizonte"));
const Zeus = React.lazy(() => import("./modules/inbound/Zeus"));
const Regras = React.lazy(() => import("./modules/inbound/Regras"));
const Ondas = React.lazy(() => import("./modules/inbound/Ondas"));
const TV = React.lazy(() => import("./modules/inbound/TV"));
const Portal = React.lazy(() => import("./modules/portal/Portal"));
const Config = React.lazy(() => import("./modules/config/Config"));

function Guard({ children, admin, internal }: { children: React.ReactNode; admin?: boolean; internal?: boolean }) {
  const { loading, session, role, access, isAdmin, isExternal } = useSession();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen grid place-items-center"><Spinner /></div>;
  if (!session) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (access.mode === "blocked") return <BlockedScreen />;
  if (!role) return <NoAccess />;
  if (admin && !isAdmin) return <Navigate to="/app/hoje" replace />;
  if (internal && isExternal) return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

const Lazy = ({ children }: { children: React.ReactNode }) => <React.Suspense fallback={<div className="p-10 grid place-items-center"><Spinner /></div>}>{children}</React.Suspense>;

export default function App() {
  useApplyBrand();
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/hoje" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/redefinir" element={<ResetPage />} />
      <Route path="/privacidade" element={<PrivacyPage />} />
      <Route path="/tv" element={<Guard internal><Lazy><TV /></Lazy></Guard>} />
      <Route element={<Guard><AppShell /></Guard>}>
        <Route path="/app" element={<Navigate to="/app/hoje" replace />} />
        <Route path="/app/hoje" element={<Guard internal><Lazy><Hoje /></Lazy></Guard>} />
        <Route path="/app/chegadas" element={<Guard internal><Lazy><Chegadas /></Lazy></Guard>} />
        <Route path="/app/portaria" element={<Guard internal><Lazy><Portaria /></Lazy></Guard>} />
        <Route path="/app/horizonte" element={<Guard internal><Lazy><Horizonte /></Lazy></Guard>} />
        <Route path="/app/zeus" element={<Guard internal><Lazy><Zeus /></Lazy></Guard>} />
        <Route path="/app/regras" element={<Guard internal><Lazy><Regras /></Lazy></Guard>} />
        <Route path="/app/ondas" element={<Guard internal><Lazy><Ondas /></Lazy></Guard>} />
        <Route path="/portal/*" element={<Lazy><Portal /></Lazy>} />
        <Route path="/config/*" element={<Lazy><Config /></Lazy>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
