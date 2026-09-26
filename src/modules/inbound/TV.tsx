import * as React from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { STATUS_LABEL, useAppointments, useDocks } from "./data";
import { TenantLogo } from "@/components/TenantLogo";
import { Z3Logo } from "@/components/Z3Logo";
import { cn, fmtHM, fmtLong, minutesOfDay, pad } from "@/lib/utils";
import { useSession } from "@/lib/session";

export default function TV() {
  const { tenantPublic, plant } = useSession();
  const q = useAppointments(0); const docks = useDocks();
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t); }, []);
  const nowMin = minutesOfDay(now);
  const list = (q.data || []).filter((a) => a.status !== "cancelled");
  const rows = list.filter((a) => a.status !== "completed" && a.status !== "no_show" && minutesOfDay(a.starts_at) >= nowMin - 120).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 12);
  const atDock = list.filter((a) => a.status === "at_dock").length, yard = list.filter((a) => a.status === "in_yard").length, next60 = list.filter((a) => ["confirmed", "en_route", "scheduled"].includes(a.status) && minutesOfDay(a.starts_at) >= nowMin && minutesOfDay(a.starts_at) <= nowMin + 60).length;
  const late = list.filter((a) => a.status === "en_route" && a.eta_at && minutesOfDay(a.eta_at) > minutesOfDay(a.starts_at));
  return (
    <div className="min-h-screen p-6 text-[#f2f2f2]" style={{ background: "var(--tv-bg)" }}>
      <div className="flex items-center gap-4">
        <TenantLogo size={44} />
        <h1 className="text-[28px] font-bold tracking-tight">{tenantPublic?.name} · {plant?.name} · chegadas</h1>
        <span className="mono text-[20px] text-[#b9bfc9]">{pad(now.getHours())}:{pad(now.getMinutes())} {fmtLong(now)}</span>
        <Link to="/app/chegadas" className="ml-auto inline-flex items-center gap-2 rounded-sm border border-[#343944] px-3 py-2 font-bold hover:bg-[#171a1f]"><X className="size-4" /> Fechar</Link>
      </div>
      <div className="grid grid-cols-[1.9fr_1fr] gap-5 mt-5">
        <div className="rounded-[10px] border border-[#262a31] bg-[#0d1016] overflow-hidden">
          <div className="grid grid-cols-[110px_1.4fr_1.2fr_80px_150px] px-4 py-2.5 text-[12px] font-bold uppercase tracking-[.08em] text-[#8e9096] border-b border-[#262a31]"><span>Janela</span><span>Fornecedor</span><span>Carga</span><span>Doca</span><span>Status</span></div>
          {rows.map((a) => {
            const l = a.eta_at && minutesOfDay(a.eta_at) > minutesOfDay(a.starts_at);
            return (
              <div key={a.id} className={cn("grid grid-cols-[110px_1.4fr_1.2fr_80px_150px] items-center px-4 py-3 border-b border-[#1d2127]", a.status === "at_dock" && "bg-[#121a2b]")}>
                <span className={cn("mono text-[22px]", l && "text-[#ff5a63]")}>{fmtHM(a.starts_at)}</span>
                <span><b className="text-[18px]">{a.supplier_name}</b><small className="block text-[13px] text-[#9aa4b8] mono">{a.vehicle_plate}{a.eta_at ? ` · chega ${fmtHM(a.eta_at)}` : a.arrived_at ? ` · chegou ${fmtHM(a.arrived_at)}` : ""}</small></span>
                <span className="text-[15px] text-[#d5d8de]">{a.material}</span>
                <span className={cn("text-[20px] font-bold", l && "text-[#ff5a63]")}>{a.dock_code}</span>
                <span className={cn("inline-flex justify-center rounded-full px-3 py-1.5 text-[14px] font-bold", a.status === "at_dock" ? "bg-[#3b7bff] text-white" : "bg-[#171a1f] text-[#d5d8de]")}>{STATUS_LABEL[a.status]}</span>
              </div>
            );
          })}
          {rows.length === 0 && <div className="p-8 text-[#8e9096]">Nada previsto nas próximas horas.</div>}
        </div>
        <div className="space-y-4">
          <div className="rounded-[10px] border border-[#262a31] bg-[#0d1016] p-4">
            <div className="text-[12px] font-bold uppercase tracking-[.08em] text-[#8e9096]">agora</div>
            <div className="flex gap-6 mt-2"><Big n={atDock} l="na doca" /><Big n={yard} l="no pátio" /><Big n={next60} l="próx. 60 min" /></div>
          </div>
          <div className="rounded-[10px] border border-[#262a31] bg-[#0d1016] p-4">
            <div className="text-[12px] font-bold uppercase tracking-[.08em] text-[#8e9096] mb-2">docas</div>
            <div className="grid grid-cols-3 gap-2">
              {(docks.data || []).map((d) => { const a = list.find((x) => x.dock_id === d.id && x.status === "at_dock"); const nx = list.filter((x) => x.dock_id === d.id && ["confirmed", "en_route", "scheduled", "in_yard", "at_gate"].includes(x.status) && minutesOfDay(x.starts_at) >= nowMin).sort((p, q2) => p.starts_at.localeCompare(q2.starts_at))[0];
                return <div key={d.id} className={cn("rounded-[8px] p-2.5 text-[13px]", a ? "bg-[#1a2a4a]" : "bg-[#12301f]")}><b>{d.name}</b><div className="text-[12px] text-[#b9bfc9] mt-0.5">{a ? `${a.supplier_short || a.supplier_name} até ${fmtHM(a.ends_at)}` : nx ? `livre até ${fmtHM(nx.starts_at)}` : "livre"}</div></div>; })}
            </div>
          </div>
          <div className="rounded-[10px] border border-[#262a31] bg-[#0d1016] p-4">
            <div className="text-[12px] font-bold uppercase tracking-[.08em] text-[#8e9096]">última instrução enviada</div>
            <div className="mt-2 border-l-2 border-[#f99d28] pl-3 text-[14px]">{late[0] ? `Motorista ${late[0].supplier_short || late[0].supplier_name} (${late[0].vehicle_plate}): Portaria 2, Pátio B, ${late[0].dock_name} às ${fmtHM(late[0].starts_at)}.` : "Nenhuma instrução pendente."}<div className="text-[12px] text-[#9aa4b8] mt-1">WhatsApp · {pad(now.getHours())}:{pad(now.getMinutes())} · Hermes</div></div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[#8e9096]">tecnologia <Z3Logo className="h-5 w-auto text-white" /></div>
        </div>
      </div>
      <div className="mt-4 overflow-hidden whitespace-nowrap text-[15px] text-[#b9bfc9]">{late.map((a) => `${a.supplier_name} atrasa ${minutesOfDay(a.eta_at!) - minutesOfDay(a.starts_at)} min para a ${a.dock_name}`).join("   ·   ") || "Operação dentro do previsto."}</div>
    </div>
  );
}
const Big = ({ n, l }: { n: number; l: string }) => <div><span className="text-[38px] font-bold leading-none">{n}</span><span className="ml-2 text-[14px] text-[#b9bfc9]">{l}</span></div>;
