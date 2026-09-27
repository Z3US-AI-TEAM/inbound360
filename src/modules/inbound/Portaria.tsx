import * as React from "react";
import { toast } from "sonner";
import { Camera, Check, X, PhoneCall, Flag, Clock } from "lucide-react";
import { Appt, STATUS_LABEL, useAppointments, usePlant, useYard, useApptMutations } from "./data";
import { ApptDrawer } from "./ApptDrawer";
import { Card, CardHeader, CardBody, Chip, Kpi } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { cn, fmtHM, minutesOfDay, relTime } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { statusChipKind } from "./Hoje";

export default function Portaria() {
  const { canWrite } = useSession();
  const plant = usePlant(); const q = useAppointments(0); const yard = useYard(); const m = useApptMutations();
  const [plate, setPlate] = React.useState("");
  const [read, setRead] = React.useState<{ appt: Appt | null; plate: string; checks: Record<string, boolean> } | null>(null);
  const [sel, setSel] = React.useState<Appt | null>(null);
  const list = (q.data || []).filter((a) => a.status !== "cancelled");
  const expected = list.filter((a) => ["confirmed", "scheduled", "en_route"].includes(a.status)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const atGate = list.filter((a) => a.status === "at_gate");
  const inYard = list.filter((a) => a.status === "in_yard");

  function readPlate(p: string) {
    const norm = p.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (norm.length < 7) return toast.error("Placa incompleta");
    const appt = list.find((a) => (a.vehicle_plate || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === norm && !["completed", "no_show", "at_dock", "in_yard", "at_gate"].includes(a.status)) || null;
    setRead({ appt, plate: norm, checks: { doc: true, lacre: true, epi: true, nfe: !!appt } });
    if (plant.data && canWrite) m.gateEvent.mutate({ plant_id: plant.data.id, appointment_id: appt?.id ?? null, plate: norm, kind: appt ? "match" : "mismatch", note: appt ? `Apolo: placa ${norm} confere com ${appt.code}` : `Apolo: placa ${norm} sem agendamento hoje` });
    toast(appt ? `Apolo: placa ${norm} confere com ${appt.code}. Tudo certo para liberar.` : `Apolo: ${norm} não tem agendamento hoje.`);
  }

  async function liberar() {
    if (!read?.appt) return;
    await m.setStatus.mutateAsync({ id: read.appt.id, status: "at_gate", note: `Portaria 2: placa ${read.plate} lida pelo Apolo, agendamento conferido, NF-e validada` });
    if (plant.data) m.gateEvent.mutate({ plant_id: plant.data.id, appointment_id: read.appt.id, plate: read.plate, kind: "gate_in", checklist: read.checks, note: "Entrada liberada com evidência" });
    toast.success("Entrada liberada. Evidência registrada com hora.");
    setRead(null); setPlate("");
  }

  return (
    <div>
      <PageHeader eyebrow="onda C · dock, gate e yard" title="Portaria e pátio" lead="Leitura de placa por câmera ou celular, conferência com o agendamento, evidência com hora e chamada para a doca. Sem robô: o Apolo lê, a portaria decide." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Esperados até o fim do dia" value={expected.length} sub={expected[0] ? `próximo ${fmtHM(expected[0].starts_at)} · ${expected[0].supplier_short || expected[0].supplier_name}` : "ninguém"} />
        <Kpi label="Na portaria" value={atGate.length} sub={atGate.length ? "enviar ao pátio ou à doca" : "portaria livre"} tone={atGate.length ? "brand" : "ok"} />
        <Kpi label="No pátio" value={inYard.length} sub={inYard.length ? "chamar para a doca" : "pátio livre"} tone={inYard.length ? "warn" : "ok"} />
        <Kpi label="Tempo médio no pátio" value={avgYard(inYard)} sub="desde a chegada" />
      </div>

      <div className="grid lg:grid-cols-[1fr_1fr] gap-4">
        <Card>
          <CardHeader title="Ler placa com o Apolo" eyebrow="câmera fixa ou celular do porteiro" />
          <CardBody className="space-y-3">
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); readPlate(plate); }}>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Digite ou leia a placa" className="mono uppercase tracking-[.12em]" />
              <Button type="submit" variant="primary"><Camera /> Ler</Button>
            </form>
            <div className="flex flex-wrap gap-1.5 text-xs text-muted">Simular leitura: {expected.slice(0, 4).map((a) => a.vehicle_plate && <button key={a.id} data-sim-plate className="chip hover:bg-surface-3" onClick={() => { setPlate(a.vehicle_plate!); readPlate(a.vehicle_plate!); }}>{a.vehicle_plate}</button>)}</div>
            {read && (
              <div className={cn("rounded border p-3", read.appt ? "border-ok bg-ok-tint" : "border-crit bg-crit-tint")}>
                <div className="flex items-center gap-2 font-bold">{read.appt ? <Check className="size-4 text-ok" /> : <X className="size-4 text-crit" />}<span className="mono">{read.plate}</span>{read.appt ? <span>confere com {read.appt.code}</span> : <span>sem agendamento hoje</span>}</div>
                {read.appt && (
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
                    <div><div className="eyebrow">Fornecedor</div><b>{read.appt.supplier_name}</b></div>
                    <div><div className="eyebrow">Janela</div><b>{read.appt.dock_name} · {fmtHM(read.appt.starts_at)}</b></div>
                    <div><div className="eyebrow">PO</div><b className="mono">{read.appt.po_number}</b></div>
                    <div><div className="eyebrow">Material</div><b>{read.appt.material}</b></div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-[12.5px]">
                  {[["doc", "Documento do motorista"], ["nfe", "NF-e da carga"], ["lacre", "Lacre íntegro"], ["epi", "EPI do motorista"]].map(([k, l]) => (
                    <label key={k} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!read.checks[k]} onChange={(e) => setRead({ ...read, checks: { ...read.checks, [k]: e.target.checked } })} /> {l}</label>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  {read.appt && canWrite && <Button variant="primary" size="sm" onClick={() => void liberar()}><Check /> Liberar entrada com evidência</Button>}
                  {!read.appt && <span className="text-[12.5px] text-ink-2">Sem agendamento: chegada não planejada. Abra um agendamento pela analista ou oriente o motorista.</span>}
                  <Button variant="ghost" size="sm" onClick={() => setRead(null)}>Limpar</Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pátio B" eyebrow="vagas, tempo de espera e chamada para a doca" />
          <CardBody>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(yard.data || []).map((s) => {
                const a = list.find((x) => x.id === s.appointment_id);
                return (
                  <div key={s.id} className={cn("rounded border p-2.5 min-h-[86px]", a ? "border-brand-line bg-brand-tint" : "border-dashed border-line-strong")}>
                    <div className="flex items-center justify-between"><b className="text-[13px]">{s.code}</b>{a && <Chip kind="brand"><Clock className="size-3" />{s.occupied_since ? relTime(s.occupied_since).replace("há ", "") : ""}</Chip>}</div>
                    {a ? (
                      <div className="mt-1 text-[12px]"><div className="font-bold truncate">{a.supplier_short || a.supplier_name}</div><div className="mono text-muted">{a.vehicle_plate} · {a.dock_code} {fmtHM(a.starts_at)}</div>
                        {canWrite && <button className="mt-1.5 inline-flex items-center gap-1 text-brand-ink font-bold" onClick={() => m.setStatus.mutate({ id: a.id, status: "at_dock", note: `Chamado para a ${a.dock_name}; motorista avisado pelo WhatsApp` }, { onSuccess: () => { m.yardAssign.mutate({ spotId: s.id, appointment_id: null }); toast.success("Motorista chamado para a doca pelo WhatsApp."); } })}><PhoneCall className="size-3" /> chamar</button>}
                      </div>
                    ) : <div className="mt-1 text-[12px] text-muted">livre</div>}
                  </div>
                );
              })}
            </div>
            {atGate.length > 0 && canWrite && (
              <div className="mt-3 rounded-sm border border-line p-3">
                <div className="eyebrow mb-1.5">Na portaria, aguardando destino</div>
                {atGate.map((a) => {
                  const free = (yard.data || []).find((s) => !s.appointment_id);
                  return (
                    <div key={a.id} className="flex flex-wrap items-center gap-2 py-1.5 text-[13px]">
                      <b>{a.supplier_short || a.supplier_name}</b><span className="mono text-muted">{a.vehicle_plate}</span><span className="text-muted">{a.dock_code} {fmtHM(a.starts_at)}</span>
                      <span className="ml-auto flex gap-1.5">
                        <Button size="sm" onClick={() => m.setStatus.mutate({ id: a.id, status: "at_dock", note: `Direto para a ${a.dock_name}; doca livre` }, { onSuccess: () => toast.success("Direto para a doca.") })}><PhoneCall /> Direto à doca</Button>
                        <Button size="sm" variant="ghost" disabled={!free} onClick={() => free && m.setStatus.mutate({ id: a.id, status: "in_yard", note: `Pátio B, vaga ${free.code}; motorista avisado pelo WhatsApp`, extra: { yard_spot: free.code } as any }, { onSuccess: () => m.yardAssign.mutate({ spotId: free.id, appointment_id: a.id }) })}><Flag /> Pátio {free?.code || ""}</Button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Esperados hoje" eyebrow="ordem de chegada prevista" />
        <CardBody>
          <table className="tbl">
            <thead><tr><th>Janela</th><th>Placa</th><th>Fornecedor</th><th>Doca</th><th>Check-in</th><th>Status</th></tr></thead>
            <tbody>
              {expected.map((a) => (
                <tr key={a.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => setSel(a)}>
                  <td className="mono">{fmtHM(a.starts_at)}</td><td className="mono">{a.vehicle_plate || "sem placa"}</td><td className="font-bold">{a.supplier_name}</td><td>{a.dock_code}</td>
                  <td className="text-xs">{a.eta_at ? `chega ${fmtHM(a.eta_at)}` : minutesOfDay(a.starts_at) - minutesOfDay(new Date()) <= 180 ? <span className="text-warn">link enviado, sem resposta</span> : <span className="text-muted">link sai 3 h antes</span>}</td>
                  <td><Chip kind={statusChipKind(a.status)}>{STATUS_LABEL[a.status]}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
      <ApptDrawer appt={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function avgYard(list: Appt[]) {
  const xs = list.filter((a) => a.arrived_at).map((a) => (Date.now() - new Date(a.arrived_at!).getTime()) / 60000);
  if (!xs.length) return "0 min";
  return Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) + " min";
}
