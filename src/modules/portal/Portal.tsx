import * as React from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarPlus, ListChecks, Lock, ArrowRight, Check, Zap } from "lucide-react";
import { useSession } from "@/lib/session";
import { usePOs, useSuppliers, useLoadTypes, useDocks, usePlant, useAllAppointments, useApptMutations, STATUS_LABEL, Supplier, LoadType, Appt } from "@/modules/inbound/data";
import { TenantLogo } from "@/components/TenantLogo";
import { Z3Logo } from "@/components/Z3Logo";
import { Card, CardHeader, CardBody, Chip, Empty } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/input";
import { PageHeader, Spinner } from "@/components/ui/misc";
import { cn, fmtHM, fmtDia, bizDay, dayName, minutesOfDay, fmtDMY } from "@/lib/utils";
import { statusChipKind } from "@/modules/inbound/Hoje";

export default function Portal() {
  const { isExternal, externalEntityIds, profile, plants, plant, setPlant, tenantPublic } = useSession();
  const suppliers = useSuppliers();
  const [pick, setPick] = React.useState<string | null>(null);
  const mine = React.useMemo(() => {
    const list = suppliers.data || [];
    if (isExternal) return list.find((s) => externalEntityIds.includes(s.id)) || null;
    return list.find((s) => s.id === pick) || list.find((s) => s.code === "QS") || list[0] || null;
  }, [suppliers.data, isExternal, externalEntityIds, pick]);
  if (suppliers.isLoading) return <div className="p-10 grid place-items-center"><Spinner /></div>;
  if (!mine) return <Empty title="Sua identidade ainda não está ligada a um fornecedor" hint="Peça à planta que vincule seu e-mail ao cadastro do fornecedor." />;
  return (
    <div className="max-w-[980px] mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <TenantLogo size={40} />
        <div><div className="eyebrow">portal do fornecedor · {tenantPublic?.name}{plants.length > 1 ? "" : plant ? ` · ${plant.name}` : ""}</div><h1 className="text-[22px]">{mine.name}</h1></div>
        {plants.length > 1 && <div className="flex items-center gap-2 text-xs text-muted">Unidade: <Select className="w-auto py-1" value={plant?.id || ""} onChange={(e) => setPlant(e.target.value)}>{plants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>}
        {!isExternal && <div className="ml-auto flex items-center gap-2 text-xs text-muted">Ver como: <Select className="w-auto py-1" value={mine.id} onChange={(e) => setPick(e.target.value)}>{(suppliers.data || []).filter((s) => !s.is_broker).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>}
        {isExternal && <div className="ml-auto text-xs text-muted">{profile?.email} · identidade válida por 60 dias sem uso</div>}
      </div>
      <Routes>
        <Route index element={<Home s={mine} />} />
        <Route path="agendar" element={<Wizard s={mine} />} />
        <Route path="agendamentos" element={<Mine s={mine} />} />
      </Routes>
      <div className="mt-8 flex items-center justify-center gap-2 text-[12px] text-muted">{mine.name} · Inbound 360 · tecnologia <Z3Logo className="h-4 w-auto text-ink" /></div>
    </div>
  );
}

function Home({ s }: { s: Supplier }) {
  const pos = usePOs(s.id); const appts = useAllAppointments();
  const mine = (appts.data || []).filter((a) => a.supplier_id === s.id && a.status !== "cancelled" && new Date(a.starts_at) >= bizDay(0));
  const open = (pos.data || []).filter((p) => p.status === "open" && (p.appointments || 0) === 0);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card><CardHeader eyebrow="ação" title="Agendar entrega" /><CardBody>
        <p className="text-[13px] text-ink-2">Informe a PO, escolha o tipo de carga e uma janela livre. Sem e-mail, sem espera: a confirmação é imediata quando a regra da planta permite.</p>
        <div className="mt-3 text-[13px]"><b>{open.length}</b> PO(s) abertas sem janela{open.length > 0 && <span className="text-muted"> · {open.slice(0, 3).map((p) => p.po_number).join(", ")}{open.length > 3 ? "…" : ""}</span>}</div>
        <Button asChild variant="primary" className="mt-4"><Link to="/portal/agendar"><CalendarPlus /> Agendar entrega</Link></Button>
      </CardBody></Card>
      <Card><CardHeader eyebrow="minhas janelas" title="Próximas entregas" actions={<Button asChild size="sm" variant="ghost"><Link to="/portal/agendamentos"><ListChecks /> Ver todas</Link></Button>} /><CardBody>
        {mine.length === 0 ? <div className="text-[13px] text-muted">Nenhuma janela futura.</div> : mine.slice(0, 4).map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-2 border-b border-line last:border-0 text-[13px]"><span className="mono">{fmtDia(a.starts_at)} {fmtHM(a.starts_at)}</span><span className="font-bold">{a.dock_code || "doca a definir"}</span><span className="text-muted truncate">{a.material}</span><span className="ml-auto"><Chip kind={statusChipKind(a.status)}>{STATUS_LABEL[a.status]}</Chip></span></div>
        ))}
      </CardBody></Card>
      <Card className="md:col-span-2"><CardBody className="pt-4 flex gap-3 text-[13px] text-ink-2"><Lock className="size-4 shrink-0 mt-0.5" /><span>Suas regras nesta planta: até <b>{s.max_windows_per_day}</b> janelas por dia, antecedência mínima de <b>{s.min_lead_hours} h</b>, corte às <b>{s.cutoff_time.slice(0, 5)}</b> para o dia seguinte. Pontualidade: <b>{s.punctuality ?? "sem histórico"}%</b>. Dúvidas? Pergunte ao Zeus pelo WhatsApp.</span></CardBody></Card>
    </div>
  );
}

function Mine({ s }: { s: Supplier }) {
  const appts = useAllAppointments(); const m = useApptMutations();
  const rows = (appts.data || []).filter((a) => a.supplier_id === s.id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return (
    <Card><CardHeader title="Meus agendamentos" /><CardBody>
      {rows.length === 0 ? <Empty title="Nenhum agendamento" /> : (
        <table className="tbl"><thead><tr><th>Janela</th><th>Doca</th><th>PO · material</th><th>Veículo</th><th>Status</th><th></th></tr></thead><tbody>
          {rows.map((a) => <tr key={a.id}><td className="mono">{fmtDia(a.starts_at)} {fmtHM(a.starts_at)}</td><td className="font-bold">{a.dock_code || "a definir"}</td><td><span className="mono text-xs">{a.po_number}</span><div className="text-xs text-muted">{a.material}</div></td><td className="mono text-xs">{a.vehicle_plate || "informar"}</td><td><Chip kind={statusChipKind(a.status)}>{STATUS_LABEL[a.status]}</Chip></td>
            <td className="text-right">{["requested", "scheduled", "confirmed"].includes(a.status) && new Date(a.starts_at) > new Date() && <Button size="sm" variant="ghost" onClick={() => m.setStatus.mutate({ id: a.id, status: "cancelled", note: "Cancelado pelo fornecedor no portal" }, { onSuccess: () => toast("Cancelado. A planta foi avisada e a doca liberada.") })}>Cancelar</Button>}</td></tr>)}
        </tbody></table>
      )}
    </CardBody></Card>
  );
}

function Wizard({ s }: { s: Supplier }) {
  const nav = useNavigate();
  const pos = usePOs(s.id); const lts = useLoadTypes(); const docks = useDocks(); const plant = usePlant(); const appts = useAllAppointments(); const m = useApptMutations();
  const [step, setStep] = React.useState(0);
  const [poNum, setPoNum] = React.useState(""); const [po, setPo] = React.useState<import("@/modules/inbound/data").PO | null>(null);
  const [lt, setLt] = React.useState<LoadType | null>(null);
  const [day, setDay] = React.useState<number | null>(null);
  const [slot, setSlot] = React.useState<{ dockId: string; dockCode: string; start: Date } | null>(null);
  const [plate, setPlate] = React.useState(""); const [driver, setDriver] = React.useState(""); const [phone, setPhone] = React.useState(""); const [nfe, setNfe] = React.useState("");
  const [done, setDone] = React.useState<Appt | null>(null);

  const validate = () => {
    const n = poNum.trim();
    const found = (pos.data || []).find((p) => p.po_number === n);
    if (!found) return toast.error("PO não encontrada na extração do SAP de hoje, ou não pertence ao seu cadastro.");
    if ((found.appointments || 0) > 0) return toast.error(`A PO ${n} já tem janela agendada. PO repetida é bloqueada.`);
    if (found.status !== "open") return toast.error("Essa PO não está aberta.");
    setPo(found); setStep(1);
  };
  const days = [1, 2, 3, 4, 5].filter((d) => { if (d === 1) { const now = new Date(); const [h, mi] = s.cutoff_time.split(":").map(Number); return now.getHours() * 60 + now.getMinutes() < h * 60 + mi || s.min_lead_hours <= 2; } return true; });
  const mineOnDay = (d: number) => (appts.data || []).filter((a) => a.supplier_id === s.id && a.status !== "cancelled" && new Date(a.starts_at).toDateString() === bizDay(d).toDateString()).length;
  const slots = React.useMemo(() => {
    if (day == null || !lt || !docks.data || !plant.data) return [] as { dockId: string; dockCode: string; start: Date }[];
    const out: { dockId: string; dockCode: string; start: Date }[] = [];
    const d = bizDay(day); const [oh, om] = plant.data.open_time.split(":").map(Number); const [ch, cm] = plant.data.close_time.split(":").map(Number);
    const H0 = oh * 60 + om, H1 = ch * 60 + cm; const list = (appts.data || []).filter((a) => a.status !== "cancelled" && a.status !== "no_show" && new Date(a.starts_at).toDateString() === d.toDateString());
    for (const dk of docks.data.filter((x) => x.active && x.kind === lt.handling)) {
      for (let t = H0; t + lt.duration_min <= H1; t += 30) {
        const st = new Date(d); st.setHours(Math.floor(t / 60), t % 60, 0, 0); const en = new Date(st.getTime() + lt.duration_min * 60000);
        if (st.getTime() < Date.now() + s.min_lead_hours * 3600000) continue;
        if (!list.some((a) => a.dock_id === dk.id && new Date(a.starts_at) < en && new Date(a.ends_at) > st)) out.push({ dockId: dk.id, dockCode: dk.code, start: st });
      }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [day, lt, docks.data, plant.data, appts.data, s]);

  async function confirm() {
    if (!po || !lt || !slot || !plant.data) return;
    const withinRules = mineOnDay(day!) < s.max_windows_per_day;
    try {
      const id = await m.create.mutateAsync({ plant_id: plant.data.id, dock_id: slot.dockId, po_id: po.id, supplier_id: s.id, load_type_id: lt.id, starts_at: slot.start.toISOString(), ends_at: new Date(slot.start.getTime() + lt.duration_min * 60000).toISOString(), status: withinRules ? "confirmed" : "requested", source: "portal", vehicle_plate: plate || null, driver_name: driver || null, driver_phone: phone || null, nfe_key: nfe || null, note: `${s.name} agendou pelo portal · PO ${po.po_number} validada na extração do SAP${withinRules ? "" : " · acima do limite de janelas do dia, aguarda a analista"}` });
      const a = (await m.invalidate(), null);
      setDone({ id, code: "", status: withinRules ? "confirmed" : "requested" } as any);
      toast.success(withinRules ? `Janela ${fmtHM(slot.start)} confirmada. Nenhum e-mail para a planta.` : "Pedido enviado à analista: você passou do limite de janelas do dia.");
      void a;
    } catch (e: any) { toast.error(e.message); }
  }

  if (done) return (
    <Card><CardBody className="pt-5 text-center">
      <div className="mx-auto grid place-items-center size-12 rounded-full bg-ok-tint text-ok"><Check className="size-6" /></div>
      <h2 className="mt-3 text-[20px]">{done.status === "confirmed" ? "Janela confirmada" : "Pedido enviado à analista"}</h2>
      <p className="mt-1 text-[13.5px] text-ink-2">{fmtDia(slot!.start)} às {fmtHM(slot!.start)} · {slot!.dockCode} · PO {po!.po_number}. Confirmação por e-mail e WhatsApp; o link de check-in do motorista sai 3 horas antes.</p>
      <div className="mt-4 flex justify-center gap-2"><Button asChild variant="primary"><Link to="/portal/agendamentos">Meus agendamentos</Link></Button><Button asChild variant="ghost"><Link to="/portal">Início</Link></Button></div>
    </CardBody></Card>
  );

  return (
    <div>
      <PageHeader title="Agendar entrega" lead={<span>Passo {step + 1} de 4 · {["PO", "Tipo de carga", "Dia e janela", "Veículo e confirmação"][step]}</span>} actions={<Button variant="ghost" onClick={() => nav("/portal")}>Cancelar</Button>} />
      <div className="grid grid-cols-4 gap-1 mb-4">{[0, 1, 2, 3].map((i) => <div key={i} className={cn("h-1.5 rounded-full", i <= step ? "bg-brand" : "bg-surface-3")} />)}</div>
      <Card><CardBody className="pt-5">
        {step === 0 && (
          <form className="max-w-[440px] space-y-3" onSubmit={(e) => { e.preventDefault(); validate(); }}>
            <Field label="Número da PO" hint="Validada contra as POs abertas na extração do SAP de hoje. PO repetida é bloqueada."><Input className="mono" value={poNum} onChange={(e) => setPoNum(e.target.value)} placeholder="4500xxxxxx" autoFocus /></Field>
            <div className="flex flex-wrap gap-1.5 text-xs text-muted">Suas POs sem janela: {(pos.data || []).filter((p) => (p.appointments || 0) === 0 && p.status === "open").slice(0, 5).map((p) => <button type="button" key={p.id} className="chip hover:bg-surface-3 mono" onClick={() => setPoNum(p.po_number)}>{p.po_number}</button>)}</div>
            <Button type="submit" variant="primary"><ArrowRight /> Continuar</Button>
          </form>
        )}
        {step === 1 && po && (
          <div className="space-y-3">
            <div className="rounded-sm border border-ok bg-ok-tint px-3 py-2 text-[13px]"><b>PO {po.po_number}</b> · {po.material} · {po.quantity} · prazo {fmtDMY(po.due_date)} <Chip kind="ok" className="ml-2">validada no SAP</Chip></div>
            <div className="grid sm:grid-cols-2 gap-2">
              {(lts.data || []).filter((l) => l.supplier_can_book).map((l) => (
                <button key={l.id} onClick={() => setLt(l)} className={cn("text-left rounded border p-3 hover:bg-surface-2", lt?.id === l.id ? "border-brand bg-brand-tint" : "border-line")}><b>{l.name}</b><div className="text-xs text-muted">{l.vehicle} · {l.duration_min} min de doca</div></button>
              ))}
            </div>
            <div className="flex gap-2"><Button variant="ghost" onClick={() => setStep(0)}>Voltar</Button><Button variant="primary" disabled={!lt} onClick={() => setStep(2)}><ArrowRight /> Continuar</Button></div>
          </div>
        )}
        {step === 2 && lt && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">{days.map((d) => { const n = mineOnDay(d); const full = n >= s.max_windows_per_day; return <button key={d} onClick={() => { setDay(d); setSlot(null); }} className={cn("rounded border px-3 py-2 text-[13px] font-semibold", day === d ? "border-brand bg-brand-tint" : "border-line", full && "opacity-60")}>{dayName(d)}{full && <span className="block text-[10px] text-warn">limite do dia ({n}/{s.max_windows_per_day})</span>}</button>; })}</div>
            {day != null && (
              <div>
                <div className="eyebrow mb-2">Janelas livres em {dayName(day)} · docas {lt.handling}</div>
                {slots.length === 0 ? <div className="text-[13px] text-muted">Nenhuma janela livre nesse dia. Tente outro dia.</div> : (
                  <div className="flex flex-wrap gap-1.5">{slots.slice(0, 40).map((sl) => <button key={sl.dockId + sl.start.getTime()} onClick={() => setSlot(sl)} className={cn("rounded-sm border px-2.5 py-1.5 text-[12.5px] mono", slot && slot.dockId === sl.dockId && slot.start.getTime() === sl.start.getTime() ? "border-brand bg-brand-tint" : "border-line hover:bg-surface-2")}>{fmtHM(sl.start)} <span className="text-muted">{sl.dockCode}</span></button>)}</div>
                )}
                {day != null && mineOnDay(day) >= s.max_windows_per_day && <p className="mt-2 text-xs text-warn">Você já tem {mineOnDay(day)} janelas nesse dia. O pedido vai para a analista aprovar.</p>}
              </div>
            )}
            <div className="flex gap-2"><Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button><Button variant="primary" disabled={!slot} onClick={() => setStep(3)}><ArrowRight /> Continuar</Button></div>
          </div>
        )}
        {step === 3 && slot && po && lt && (
          <div className="space-y-3 max-w-[520px]">
            <div className="rounded-sm border border-line p-3 text-[13px]"><b>{fmtDia(slot.start)} às {fmtHM(slot.start)}</b> · {slot.dockCode} · {lt.name} · PO {po.po_number} · {po.material}</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Placa do veículo" hint="Pode informar até 3 h antes"><Input className="mono uppercase" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABC1D23" /></Field>
              <Field label="Motorista"><Input value={driver} onChange={(e) => setDriver(e.target.value)} /></Field>
              <Field label="WhatsApp do motorista" hint="Recebe o link de check-in e as instruções da portaria"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+55 11 9xxxx-xxxx" /></Field>
              <Field label="Chave da NF-e" hint="44 dígitos, quando emitida"><Input className="mono" value={nfe} onChange={(e) => setNfe(e.target.value)} /></Field>
            </div>
            <div className="flex gap-2"><Button variant="ghost" onClick={() => setStep(2)}>Voltar</Button><Button variant="primary" onClick={() => void confirm()} disabled={m.create.isPending}><Zap /> Confirmar janela</Button></div>
          </div>
        )}
      </CardBody></Card>
    </div>
  );
}
