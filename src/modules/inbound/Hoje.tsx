import * as React from "react";
import { toast } from "sonner";
import { Tv, Zap, AlertTriangle, Check, X, Clock, Truck, Move, Mail } from "lucide-react";
import { Appt, ApptStatus, STATUS_LABEL, useAppointments, useDocks, useLoadTypes, usePlant, useReleases, useSuppliers, usePOs, useApptMutations, dayRange } from "./data";
import { ApptDrawer } from "./ApptDrawer";
import { Kpi, Card, CardHeader, CardBody, Chip, Empty } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, Seg, Spinner } from "@/components/ui/misc";
import { cn, fmtHM, minutesOfDay, dayName, bizDay, relTime, fmtDMY } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { Link } from "react-router-dom";

const H0 = 6 * 60, H1 = 22 * 60;
const STATUS_CLASS: Record<ApptStatus, string> = {
  requested: "border-dashed border-line-strong bg-surface-2 text-ink-2",
  scheduled: "border-line-strong bg-surface-3",
  confirmed: "border-line-strong bg-surface-3",
  en_route: "border-info-line bg-info-tint text-info-ink",
  at_gate: "border-brand-line bg-brand-tint text-brand-ink",
  in_yard: "border-brand-line bg-brand-tint text-brand-ink",
  at_dock: "border-transparent bg-info text-white",
  completed: "border-transparent bg-ok-tint text-ok",
  no_show: "border-transparent bg-crit-tint text-crit",
  cancelled: "border-dashed border-line opacity-50",
};
export function statusChipKind(s: ApptStatus): "default" | "ok" | "warn" | "crit" | "info" | "brand" {
  return s === "completed" ? "ok" : s === "no_show" ? "crit" : s === "at_dock" || s === "en_route" ? "info" : s === "at_gate" || s === "in_yard" ? "brand" : s === "requested" ? "warn" : "default";
}

export default function Hoje() {
  const { canWrite, tenant, user } = useSession();
  const [day, setDay] = React.useState(0);
  const [sel, setSel] = React.useState<Appt | null>(null);
  const [moving, setMoving] = React.useState<Appt | null>(null);
  const plant = usePlant(); const docks = useDocks(); const lts = useLoadTypes(); const suppliers = useSuppliers();
  const appts = useAppointments(day); const releases = useReleases(); const pos = usePOs();
  const m = useApptMutations();
  const now = new Date(); const nowMin = minutesOfDay(now); const isToday = day === 0 && dayRange(0).ymd === dayRange(0).ymd && bizDay(0).toDateString() === now.toDateString();

  const list = appts.data || [];
  const active = list.filter((a) => a.status !== "cancelled");
  const kpi = {
    total: active.length,
    done: active.filter((a) => a.status === "completed").length,
    atDock: active.filter((a) => a.status === "at_dock").length,
    yard: active.filter((a) => a.status === "in_yard").length,
    queue: active.filter((a) => a.status === "requested").length,
    freeTime: (pos.data || []).filter((p) => p.free_time_until && new Date(p.free_time_until + "T12:00:00") <= bizDay(1)).length,
    occupancy: Math.round(active.filter((a) => a.status !== "no_show").reduce((s, a) => s + a.duration_min, 0) / ((docks.data?.length || 6) * (H1 - H0)) * 100),
  };
  const queue = active.filter((a) => a.status === "requested").sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));
  const alerts = buildAlerts(active, nowMin, isToday);

  async function simulateSupplier() {
    if (!plant.data || !docks.data || !lts.data || !suppliers.data) return;
    const qs = suppliers.data.find((s) => s.code === "QS"); const lt = lts.data.find((l) => l.code === "pal_car");
    const po = (pos.data || []).find((p) => p.supplier_code === "QS" && p.appointments === 0) || (pos.data || []).find((p) => p.supplier_code === "QS");
    if (!qs || !lt || !po) return toast.error("Sem PO livre para simular");
    const d = bizDay(day); const busy = active.filter((a) => a.dock_kind === "paletizada");
    let slot: { dock: string; start: Date } | null = null;
    for (const dk of docks.data.filter((x) => x.kind === "paletizada")) {
      for (let t = Math.max(H0, day === 0 ? Math.ceil((nowMin + 60) / 30) * 30 : H0); t + lt.duration_min <= H1; t += 30) {
        const s = new Date(d); s.setHours(Math.floor(t / 60), t % 60, 0, 0); const e = new Date(s.getTime() + lt.duration_min * 60000);
        const conflict = busy.some((a) => a.dock_id === dk.id && new Date(a.starts_at) < e && new Date(a.ends_at) > s);
        if (!conflict) { slot = { dock: dk.id, start: s }; break; }
      }
      if (slot) break;
    }
    if (!slot) return toast.error("Sem janela livre hoje");
    const id = await m.create.mutateAsync({ plant_id: plant.data.id, dock_id: slot.dock, po_id: po.id, supplier_id: qs.id, load_type_id: lt.id, starts_at: slot.start.toISOString(), ends_at: new Date(slot.start.getTime() + lt.duration_min * 60000).toISOString(), status: "confirmed", source: "portal", vehicle_plate: "FBS4A77", note: `${qs.name} agendou pelo portal · PO ${po.po_number} validada na extração do SAP` });
    toast.success(`${qs.name} agendou ${fmtHM(slot.start)} sem mandar e-mail. Apareceu na grade.`);
    setTimeout(() => setSel((appts.data || []).find((a) => a.id === id) || null), 600);
  }

  return (
    <div>
      <PageHeader eyebrow="onda A · agendamento e o dia de hoje" title="Hoje nas docas"
        lead="Tudo que chega, na doca em que vai chegar. O fornecedor agendou sozinho, a PO foi validada contra a extração do SAP e a prioridade veio de free time e cobertura de estoque. A analista aprova, move e decide."
        actions={<>
          <Button asChild><Link to="/tv"><Tv /> Abrir na TV</Link></Button>
          {canWrite && tenant?.demo && <Button variant="zeus" onClick={() => void simulateSupplier()} disabled={m.create.isPending}><Zap /> Simular fornecedor agendando</Button>}
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        <Kpi label={`Janelas ${dayName(day)}`} value={kpi.total} sub={`${kpi.done} concluídas · ${kpi.atDock} na doca`} />
        <Kpi label="Ocupação das docas" value={`${kpi.occupancy}%`} sub={`${docks.data?.length || 0} docas · ${plant.data?.open_time?.slice(0, 5) || "06:00"} às ${plant.data?.close_time?.slice(0, 5) || "22:00"}`} />
        <Kpi label="Esperando no pátio" value={kpi.yard} sub={kpi.yard ? "chamar para a doca" : "pátio livre"} tone={kpi.yard ? "warn" : "ok"} />
        <Kpi label="Solicitações na fila" value={kpi.queue} sub={kpi.queue ? "sugestão pronta" : "fila vazia"} tone={kpi.queue ? "brand" : "ok"} />
        <Kpi label="Free time vencendo" value={kpi.freeTime} sub={kpi.freeTime ? "até amanhã" : "nenhum"} tone={kpi.freeTime ? "crit" : "ok"} />
        <Kpi label="E-mails de agendamento" value={0} sub="Tudo entrou pelo portal e pelos brokers" tone="brand" />
      </div>

      <Card className="mb-4">
        <CardHeader title="Grade de docas" actions={<>
          <Seg value={String(day) as "0" | "1" | "2"} onChange={(v) => setDay(Number(v))} options={[{ value: "0", label: "Hoje" }, { value: "1", label: "Amanhã" }, { value: "2", label: dayName(2) }]} />
          <span className="hidden md:inline text-[12.5px] text-muted">{moving ? "Escolha a doca e a hora livre para mover" : "Clique num agendamento para abrir."}</span>
          {moving && <Button size="sm" variant="ghost" onClick={() => setMoving(null)}><X /> Cancelar</Button>}
        </>} />
        <CardBody>
          {appts.isLoading || docks.isLoading ? <div className="p-6 grid place-items-center"><Spinner /></div> : (
            <DockGrid docks={docks.data || []} appts={active} nowMin={isToday ? nowMin : null} moving={moving} onSelect={(a) => setSel(a)}
              onDrop={async (dockId, startMin) => {
                if (!moving) return;
                const d = bizDay(day); const s = new Date(d); s.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0); const e = new Date(s.getTime() + moving.duration_min * 60000);
                try { await m.move.mutateAsync({ id: moving.id, dock_id: dockId, starts_at: s.toISOString(), ends_at: e.toISOString() }); toast.success("Janela movida. Fornecedor e motorista avisados."); setMoving(null); } catch (err: any) { toast.error(err.message); }
              }} />
          )}
          <Legend />
        </CardBody>
      </Card>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-4">
        <Card>
          <CardHeader title="Fila de solicitações" eyebrow="prioridade v1 · free time, cobertura, prazo" />
          <CardBody>
            {queue.length === 0 ? <Empty title="Nenhuma solicitação esperando" hint="Quando um fornecedor pedir uma janela fora da regra, ela cai aqui com a prioridade calculada." /> : (
              <table className="tbl">
                <thead><tr><th>Fornecedor</th><th>PO · material</th><th>Pedido</th><th>Prioridade</th><th></th></tr></thead>
                <tbody>
                  {queue.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => setSel(a)}>
                      <td className="font-bold">{a.supplier_name}</td>
                      <td><span className="mono text-xs">{a.po_number}</span><div className="text-xs text-muted">{a.material}</div></td>
                      <td className="mono text-xs">{fmtHM(a.starts_at)} · {a.dock_code || "doca livre"}</td>
                      <td><Score s={a.priority_score} r={a.priority_reason} /></td>
                      <td className="text-right whitespace-nowrap">
                        {canWrite && <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); m.setStatus.mutate({ id: a.id, status: "confirmed", note: "Aprovado pela analista na fila" }, { onSuccess: () => toast.success("Aprovado. Confirmação enviada ao fornecedor.") }); }}><Check /> Aprovar</Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Alertas de agora" />
            <CardBody className="space-y-2">
              {alerts.length === 0 && <div className="text-[13px] text-muted">Nada fora do previsto neste momento.</div>}
              {alerts.map((al, i) => (
                <button key={i} className="w-full text-left flex gap-2.5 rounded-sm border border-line px-3 py-2 hover:bg-surface-2" onClick={() => setSel(al.appt)}>
                  <span className={cn("mt-0.5 shrink-0", al.tone === "crit" ? "text-crit" : al.tone === "warn" ? "text-warn" : "text-info-ink")}>{al.tone === "crit" ? <AlertTriangle className="size-4" /> : al.tone === "warn" ? <Clock className="size-4" /> : <Truck className="size-4" />}</span>
                  <span className="text-[13px]"><b>{al.title}</b><span className="text-ink-2"> · {al.body}</span></span>
                </button>
              ))}
            </CardBody>
          </Card>
          <Liberados releases={releases.data || []} pos={pos.data || []} suppliers={suppliers.data || []} onOpen={(id) => setSel(list.find((x) => x.id === id) || null)} />
        </div>
      </div>

      <ApptDrawer appt={sel} onClose={() => setSel(null)} onMove={(a) => { setMoving(a); setSel(null); toast("Clique numa hora livre da grade para mover " + a.supplier_short); }} />
    </div>
  );
}

function Score({ s, r }: { s: number | null; r: string | null }) {
  if (s == null) return <span className="text-muted text-xs">sem PO</span>;
  const tone = s >= 80 ? "text-crit" : s >= 60 ? "text-warn" : "text-ok";
  return <span className="inline-flex items-center gap-2 text-xs"><b className={cn("mono", tone)}>{s}</b><span className="text-muted">{r}</span></span>;
}

function buildAlerts(list: Appt[], nowMin: number, isToday: boolean) {
  if (!isToday) return [] as { title: string; body: string; tone: "crit" | "warn" | "info"; appt: Appt }[];
  const out: { title: string; body: string; tone: "crit" | "warn" | "info"; appt: Appt }[] = [];
  for (const a of list) {
    const start = minutesOfDay(a.starts_at);
    if (a.status === "en_route" && a.eta_at && minutesOfDay(a.eta_at) > start) out.push({ title: `${a.supplier_short || a.supplier_name} atrasa ${minutesOfDay(a.eta_at) - start} min`, body: `${a.dock_name} às ${fmtHM(a.starts_at)}, chega ${fmtHM(a.eta_at)}`, tone: "warn", appt: a });
    if (a.status === "in_yard") out.push({ title: `${a.supplier_short || a.supplier_name} no pátio desde ${fmtHM(a.arrived_at || a.starts_at)}`, body: `${a.dock_name} às ${fmtHM(a.starts_at)} · chamar para a doca`, tone: "info", appt: a });
    if (["confirmed", "scheduled"].includes(a.status) && nowMin > start + 30) out.push({ title: `${a.supplier_short || a.supplier_name} sem chegada`, body: `janela ${fmtHM(a.starts_at)} passou há ${nowMin - start} min · registrar no-show?`, tone: "crit", appt: a });
    if (a.status === "at_dock" && nowMin > minutesOfDay(a.ends_at) + 10) out.push({ title: `${a.dock_name} estourou a janela`, body: `${a.supplier_short || a.supplier_name} deveria ter terminado ${fmtHM(a.ends_at)}`, tone: "warn", appt: a });
  }
  return out.slice(0, 6);
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-ink-2">
      <L c="bg-ok-tint border-transparent" t="Concluído" /><L c="bg-info border-transparent" t="Na doca" /><L c="bg-brand-tint border-brand-line" t="Na portaria ou no pátio" /><L c="bg-info-tint border-info-line" t="A caminho" /><L c="bg-surface-3 border-line-strong" t="Confirmado" /><L c="bg-surface-2 border-dashed border-line-strong" t="Solicitado, aguarda a analista" /><L c="bg-crit-tint border-transparent" t="No-show" />
    </div>
  );
}
const L = ({ c, t }: { c: string; t: string }) => <span className="inline-flex items-center gap-1.5"><i className={cn("inline-block w-3 h-3 rounded-[3px] border", c)} />{t}</span>;

export function DockGrid({ docks, appts, nowMin, moving, onSelect, onDrop, compact }: { docks: { id: string; code: string; name: string; kind: string }[]; appts: Appt[]; nowMin: number | null; moving?: Appt | null; onSelect: (a: Appt) => void; onDrop?: (dockId: string, startMin: number) => void; compact?: boolean }) {
  const hours = []; for (let h = H0; h < H1; h += 60) hours.push(h);
  const pct = (min: number) => ((min - H0) / (H1 - H0)) * 100;
  return (
    <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
      <div className="min-w-[1180px]">
        <div className="grid" style={{ gridTemplateColumns: "150px 1fr" }}>
          <div className="eyebrow py-1.5 px-2 border-b border-line">docas</div>
          <div className="relative border-b border-line h-8">
            {hours.map((h) => <span key={h} className="absolute top-1.5 mono text-[11px] text-muted border-l border-grid pl-1" style={{ left: pct(h) + "%" }}>{String(h / 60).padStart(2, "0")}h</span>)}
          </div>
          {docks.map((d, i) => {
            const rows = appts.filter((a) => a.dock_id === d.id);
            return (
              <React.Fragment key={d.id}>
                <div className={cn("px-2 py-2 border-b border-line", compact ? "h-11" : "h-[54px]")}>
                  <div className="font-bold text-[13px] leading-tight">{d.name}</div>
                  <div className="text-[11px] text-muted capitalize">{d.kind}</div>
                </div>
                <div className={cn("relative border-b border-line", compact ? "h-11" : "h-[54px]", moving && "cursor-crosshair")}
                  style={{ backgroundImage: "repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px calc(100% / 16))" }}
                  onClick={(e) => {
                    if (!moving || !onDrop) return;
                    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; const min = Math.round((H0 + x * (H1 - H0)) / 15) * 15;
                    onDrop(d.id, min);
                  }}>
                  {rows.map((a) => {
                    const s = minutesOfDay(a.starts_at), e = Math.min(H1, s + a.duration_min);
                    return (
                      <button key={a.id} onClick={(ev) => { ev.stopPropagation(); if (!moving) onSelect(a); }} title={`${a.supplier_name} · ${fmtHM(a.starts_at)} · ${STATUS_LABEL[a.status]}`}
                        className={cn("absolute top-1.5 bottom-1.5 rounded-[6px] border px-1.5 text-left overflow-hidden leading-tight", STATUS_CLASS[a.status], moving?.id === a.id && "ring-2 ring-brand")}
                        style={{ left: pct(s) + "%", width: Math.max(2.5, pct(e) - pct(s)) + "%" }}>
                        <div className="text-[11.5px] font-bold truncate">{a.supplier_short || a.supplier_name}</div>
                        {!compact && <div className="mono text-[10px] opacity-80 truncate">{fmtHM(a.starts_at)} {a.container_no || a.material || ""}</div>}
                      </button>
                    );
                  })}
                  {nowMin != null && nowMin >= H0 && nowMin <= H1 && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-crit-fill z-[3] pointer-events-none" style={{ left: pct(nowMin) + "%" }}>
                      {i === docks.length - 1 && <span className="absolute -bottom-px left-1/2 -translate-x-1/2 rounded px-1 text-[9px] font-bold uppercase tracking-[.06em] text-white bg-crit-fill">agora</span>}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Liberados({ releases, pos, suppliers, onOpen }: { releases: import("./data").Release[]; pos: import("./data").PO[]; suppliers: import("./data").Supplier[]; onOpen: (apptId: string) => void }) {
  const m = useApptMutations(); const { canWrite } = useSession();
  const today = releases.filter((r) => new Date(r.received_at).toDateString() === bizDay(0).toDateString() || r.status !== "scheduled");
  const pending = today.filter((r) => r.status === "new");
  function suggest(r: import("./data").Release) {
    const po = pos.find((p) => p.id === r.po_id); const cov = po?.coverage_days ?? 99; const ft = r.free_time_days ?? 9;
    if (ft <= 1) return { day: 1, time: "06:00", why: "free time vence amanhã" };
    if (cov <= 2) return { day: 1, time: "08:00", why: `cobertura de ${cov} dias` };
    if (ft <= 2) return { day: 2, time: "06:00", why: `free time em ${ft} dias` };
    return { day: 2, time: "08:00", why: `cobertura de ${cov} dias, free time em ${ft}` };
  }
  return (
    <Card>
      <CardHeader title="Liberados do dia" eyebrow="e-mails dos brokers, lidos pelo Cronos" actions={pending.length > 0 && canWrite ? <Button size="sm" variant="zeus" onClick={async () => {
        for (const r of pending) { const s = suggest(r); const d = bizDay(s.day); const [hh, mm] = s.time.split(":").map(Number); d.setHours(hh, mm, 0, 0); await m.releaseAction.mutateAsync({ id: r.id, patch: { status: "proposed", suggested_at: d.toISOString(), suggestion_reason: s.why } }); }
        toast.success(`${pending.length} janelas propostas aos brokers. Nenhum e-mail escrito à mão.`);
      }}><Zap /> Propor janelas</Button> : undefined} />
      <CardBody>
        {today.length === 0 ? <div className="text-[13px] text-muted">Nenhum liberado hoje.</div> : (
          <table className="tbl">
            <thead><tr><th>Broker</th><th>Contêiner · PO</th><th>Free time</th><th>Situação</th></tr></thead>
            <tbody>
              {today.map((r) => {
                const b = suppliers.find((s) => s.id === r.broker_id); const po = pos.find((p) => p.id === r.po_id); const s = suggest(r);
                return (
                  <tr key={r.id}>
                    <td className="font-bold">{b?.short_name || b?.name}<div className="text-[11px] text-muted mono">{fmtHM(r.received_at)}</div></td>
                    <td><span className="mono text-xs">{r.container_no}</span><div className="text-xs text-muted">{po?.po_number} · {po?.material}</div></td>
                    <td><Chip kind={(r.free_time_days ?? 9) <= 1 ? "crit" : (r.free_time_days ?? 9) <= 2 ? "warn" : "default"}>{r.free_time_days} d</Chip></td>
                    <td className="text-xs">
                      {r.status === "scheduled" && r.appointment_id && <button className="text-brand-ink font-bold" onClick={() => onOpen(r.appointment_id!)}>agendado <Mail className="inline size-3" /></button>}
                      {r.status === "proposed" && <span className="text-ink-2">proposta {r.suggested_at ? `${dayName(new Date(r.suggested_at).toDateString() === bizDay(1).toDateString() ? 1 : 2)} ${fmtHM(r.suggested_at)}` : ""} · {r.suggestion_reason}</span>}
                      {r.status === "new" && <span className="text-muted">sugestão: {dayName(s.day)} {s.time} · {s.why}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}
export { fmtDMY, relTime, Move };
