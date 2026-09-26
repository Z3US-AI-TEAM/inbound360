import * as React from "react";
import { toast } from "sonner";
import { Check, X, Move, Truck, DoorOpen, Flag, PhoneCall, Zap } from "lucide-react";
import { Appt, ApptStatus, STATUS_LABEL, useEvents, useApptMutations } from "./data";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/card";
import { cn, fmtHM, fmtDia, fmtDMY } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { statusChipKind } from "./Hoje";

const NEXT: Partial<Record<ApptStatus, { to: ApptStatus; label: string; icon: React.ReactNode; note: string }>> = {
  requested: { to: "confirmed", label: "Aprovar", icon: <Check />, note: "Aprovado pela analista" },
  scheduled: { to: "confirmed", label: "Confirmar", icon: <Check />, note: "Confirmado pela analista" },
  confirmed: { to: "en_route", label: "Motorista a caminho", icon: <Truck />, note: "Check-in do motorista registrado" },
  en_route: { to: "at_gate", label: "Chegou na portaria", icon: <DoorOpen />, note: "Portaria: placa conferida com o agendamento" },
  at_gate: { to: "in_yard", label: "Enviar ao pátio", icon: <Flag />, note: "Pátio B; motorista avisado pelo WhatsApp" },
  in_yard: { to: "at_dock", label: "Chamar para a doca", icon: <PhoneCall />, note: "Chamado para a doca; início da descarga" },
  at_dock: { to: "completed", label: "Concluir descarga", icon: <Check />, note: "Descarga concluída; conferência sem divergência" },
};

export function ApptDrawer({ appt, onClose, onMove }: { appt: Appt | null; onClose: () => void; onMove?: (a: Appt) => void }) {
  const { canWrite } = useSession();
  const ev = useEvents(appt?.id ?? null);
  const m = useApptMutations();
  const a = appt;
  const next = a ? NEXT[a.status] : undefined;
  return (
    <Dialog open={!!a} onOpenChange={(o) => { if (!o) onClose(); }}>
      {a && (
        <DialogContent side="right" title={a.supplier_name} description={<span className="mono">{a.code} · {STATUS_LABEL[a.status]}</span>}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <KV k="Janela" v={`${fmtDia(a.starts_at)} · ${fmtHM(a.starts_at)} às ${fmtHM(a.ends_at)}`} />
            <KV k="Doca" v={a.dock_name || "a definir"} />
            <KV k="PO" v={<span className="mono">{a.po_number || "sem PO"}</span>} />
            <KV k="Material" v={`${a.material || ""} ${a.quantity ? "· " + a.quantity : ""}`} />
            <KV k="Tipo de carga" v={`${a.load_type_name} · ${a.duration_min} min`} />
            <KV k="Veículo" v={<span className="mono">{a.vehicle_plate || "placa não informada"}</span>} />
            {a.container_no && <KV k="Contêiner" v={<span className="mono">{a.container_no}</span>} />}
            {a.eta_at && <KV k="Previsão de chegada" v={fmtHM(a.eta_at)} />}
            {a.arrived_at && <KV k="Chegou" v={fmtHM(a.arrived_at)} />}
            {a.yard_spot && <KV k="Vaga no pátio" v={a.yard_spot} />}
            {a.coverage_days != null && <KV k="Cobertura de estoque" v={`${a.coverage_days} dias`} />}
            {a.free_time_until && <KV k="Free time até" v={fmtDMY(a.free_time_until)} />}
            <KV k="Origem" v={a.source === "portal" ? "Portal do fornecedor" : a.source === "broker_email" ? "E-mail do broker (Cronos)" : a.source === "zeus" ? "Zeus" : "Analista"} />
            <KV k="Pontualidade do fornecedor" v={a.punctuality != null ? `${a.punctuality}%` : "sem histórico"} />
          </div>
          {a.priority_reason && <div className="mt-3 rounded-sm border border-brand-line bg-brand-tint px-3 py-2 text-[12.5px]"><b className="text-brand-ink">Prioridade {a.priority_score}</b> <span className="text-ink-2">· {a.priority_reason}</span></div>}

          {canWrite && (
            <div className="mt-4 flex flex-wrap gap-2">
              {next && <Button variant="primary" size="sm" onClick={() => m.setStatus.mutate({ id: a.id, status: next.to, note: next.note }, { onSuccess: () => { toast.success(next.label + ": feito"); onClose(); } })}>{next.icon} {next.label}</Button>}
              {["requested", "scheduled", "confirmed"].includes(a.status) && onMove && <Button size="sm" onClick={() => onMove(a)}><Move /> Mover janela</Button>}
              {["confirmed", "scheduled", "en_route"].includes(a.status) && <Button size="sm" variant="danger" onClick={() => m.setStatus.mutate({ id: a.id, status: "no_show", note: "No-show registrado pela analista; fornecedor notificado" }, { onSuccess: () => { toast("No-show registrado. Doca liberada para a fila."); onClose(); } })}><X /> No-show</Button>}
              {["requested", "scheduled", "confirmed"].includes(a.status) && <Button size="sm" variant="ghost" onClick={() => m.setStatus.mutate({ id: a.id, status: "cancelled", note: "Cancelado pela analista; fornecedor notificado" }, { onSuccess: () => { toast("Cancelado."); onClose(); } })}>Cancelar</Button>}
              <Button size="sm" variant="zeus" onClick={() => { toast.success("Zeus avisou o motorista pelo WhatsApp: portaria 2, pátio B, " + (a.dock_name || "doca a definir") + " às " + fmtHM(a.starts_at) + "."); void m.addEvent(a.id, "notified", "Instrução enviada ao motorista pelo WhatsApp (Hermes)"); }}><Zap /> Avisar motorista</Button>
            </div>
          )}

          <div className="mt-5">
            <div className="eyebrow mb-2">Linha do tempo</div>
            <ol className="space-y-2">
              {(ev.data || []).map((e) => (
                <li key={e.id} className="flex gap-3 text-[12.5px]">
                  <span className="mono text-muted w-11 shrink-0">{fmtHM(e.at)}</span>
                  <span className={cn("mt-1.5 size-2 rounded-full shrink-0", e.kind === "completed" ? "bg-ok" : e.kind === "no_show" || e.kind === "cancelled" ? "bg-crit" : e.kind === "eta" ? "bg-warn" : e.kind === "booked" || e.kind === "zeus" ? "bg-brand" : "bg-info")} />
                  <span className="text-ink-2">{e.note}</span>
                </li>
              ))}
              {ev.data && ev.data.length === 0 && <li className="text-muted text-[12.5px]">Sem eventos ainda.</li>}
            </ol>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="min-w-0"><div className="eyebrow">{k}</div><div className="font-semibold truncate">{v}</div></div>;
}
