import * as React from "react";
import { Zap, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { useAllAppointments, usePOs, useReleases, useCapacity, useDocks } from "./data";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Spinner } from "@/components/ui/misc";
import { cn, fmtHM, fmtDMY, bizDay, pad, minutesOfDay } from "@/lib/utils";
import { trackAction } from "@/lib/engagement";

interface Msg { role: "user" | "assistant"; content: string; sources?: { name: string; at: string }[]; model?: string }

const CHIPS = ["Quanto de demurrage tenho em risco esta semana?", "Quantas janelas livres amanhã para carreta?", "Quem está atrasado agora?", "O que chega hoje da Química Serrana?", "Qual navio está atrasado?"];

export default function Zeus() {
  const { tenant, user, isExternal, externalEntityIds } = useSession();
  const appts = useAllAppointments(); const pos = usePOs(); const rel = useReleases(); const cap = useCapacity(); const docks = useDocks();
  const [msgs, setMsgs] = React.useState<Msg[]>([]);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { box.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [msgs]);

  const stamp = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  function localAnswer(question: string): Msg | null {
    const s = question.toLowerCase(); const now = stamp();
    const list = (appts.data || []).filter((a) => !isExternal || externalEntityIds.includes(a.supplier_id));
    const today = list.filter((a) => new Date(a.starts_at).toDateString() === bizDay(0).toDateString());
    if (s.includes("demurrage") || s.includes("free time")) {
      const risk = (pos.data || []).filter((p) => p.free_time_until && p.status !== "received").map((p) => ({ p, d: Math.round((new Date(p.free_time_until! + "T12:00:00").getTime() - bizDay(0).getTime()) / 86400000) })).filter((x) => x.d <= 5).sort((a, b) => a.d - b.d);
      if (!risk.length) return { role: "assistant", content: "Nenhum contêiner com free time vencendo nos próximos 5 dias.", sources: [{ name: "ib_purchase_orders (extração SAP 06:30)", at: now }] };
      return { role: "assistant", content: `${risk.length} contêiner(es) com free time até 5 dias:\n` + risk.map((x) => `• ${x.p.container_no || x.p.po_number} · ${x.p.material} · free time ${x.d <= 0 ? "vence hoje" : x.d === 1 ? "vence amanhã" : "em " + x.d + " dias"} · ${(x.p.appointments || 0) > 0 ? "já agendado" : "SEM janela"}`).join("\n") + `\nOs sem janela são os que viram demurrage. Quer que eu proponha janelas amanhã de manhã?`, sources: [{ name: "ib_purchase_orders (extração SAP 06:30)", at: now }, { name: "ib_appointments", at: now }] };
    }
    if (s.includes("janela") && (s.includes("livre") || s.includes("amanh"))) {
      const d1 = bizDay(1); const tomorrow = list.filter((a) => new Date(a.starts_at).toDateString() === d1.toDateString() && a.status !== "cancelled");
      const pal = (docks.data || []).filter((d) => d.kind === "paletizada"); const total = pal.length * 16; const used = tomorrow.filter((a) => a.dock_kind === "paletizada").reduce((x, a) => x + a.duration_min / 60, 0);
      return { role: "assistant", content: `Amanhã (${fmtDMY(d1)}), nas ${pal.length} docas paletizadas: ${tomorrow.filter((a) => a.dock_kind === "paletizada").length} janela(s) ocupada(s), ${Math.round(total - used)} horas livres entre 06h e 22h. Para carreta (60 min), cabem cerca de ${Math.floor(total - used)} janelas. A regra do fornecedor limita ${isExternal ? "as suas" : "cada fornecedor a"} janelas por dia; o corte é 16h.`, sources: [{ name: "ib_appointments + ib_docks", at: now }, { name: "ib_rules (cutoff_time, windows_per_supplier_per_day)", at: now }] };
    }
    if (s.includes("atras")) {
      const nowMin = minutesOfDay(new Date());
      const late = today.filter((a) => (a.status === "en_route" && a.eta_at && minutesOfDay(a.eta_at) > minutesOfDay(a.starts_at)) || (["confirmed", "scheduled"].includes(a.status) && nowMin > minutesOfDay(a.starts_at) + 30));
      const ships = (pos.data || []).filter((p) => p.vessel_delay_days > 0);
      const parts = [];
      if (late.length) parts.push(`Na planta agora: ` + late.map((a) => `${a.supplier_name} (${a.dock_code} ${fmtHM(a.starts_at)}${a.eta_at ? `, chega ${fmtHM(a.eta_at)}` : ", sem check-in"})`).join("; ")); else parts.push("Ninguém atrasado na planta neste momento.");
      if (ships.length && s.includes("navio")) parts.push(`Navios: ` + ships.map((p) => `${p.material} (${p.po_number}) ${p.vessel_delay_days} dias atrasado, ETA ${fmtDMY(p.eta)}`).join("; "));
      return { role: "assistant", content: parts.join("\n"), sources: [{ name: "ib_appointments (ETA do check-in)", at: now }, ...(ships.length ? [{ name: "ib_purchase_orders (ETA do armador)", at: now }] : [])] };
    }
    if (s.includes("navio")) {
      const ships = (pos.data || []).filter((p) => p.vessel_delay_days > 0);
      return { role: "assistant", content: ships.length ? ships.map((p) => `• ${p.material} · ${p.po_number} · navio ${p.vessel_delay_days} dias atrasado · ETA ${fmtDMY(p.eta)} · ${p.vessel_delay_days >= 7 ? "produção em risco" : "em alerta"}`).join("\n") : "Nenhum navio atrasado.", sources: [{ name: "ib_purchase_orders (ETA do armador)", at: now }] };
    }
    if (s.includes("chega hoje") || s.includes("hoje")) {
      const m = /da ([a-zà-ú .]+)\??$/i.exec(question); const name = m?.[1]?.trim().toLowerCase();
      const rows = today.filter((a) => !name || a.supplier_name.toLowerCase().includes(name) || (a.supplier_short || "").toLowerCase().includes(name));
      return { role: "assistant", content: rows.length ? `${rows.length} chegada(s) hoje${name ? " de " + rows[0].supplier_name : ""}:\n` + rows.map((a) => `• ${fmtHM(a.starts_at)} · ${a.dock_code} · ${a.material} · ${a.status === "completed" ? "concluído" : a.status === "at_dock" ? "na doca" : a.status === "in_yard" ? "no pátio" : a.status === "en_route" ? "a caminho" : "confirmado"}`).join("\n") : "Nada agendado hoje com esse filtro.", sources: [{ name: "ib_appointments", at: now }] };
    }
    if (s.includes("capacidade") || s.includes("armazém externo") || s.includes("pico")) {
      const over = (cap.data || []).filter((c) => c.demand_pallets * 1.35 > c.capacity_pallets);
      return { role: "assistant", content: `Com o pico sazonal (+35%), ${over.length} dia(s) passam da capacidade de ${cap.data?.[0]?.capacity_pallets ?? 1600} pallets: ${over.map((c) => fmtDMY(c.day).slice(0, 5)).join(", ") || "nenhum"}. Alternativas: armazém externo nesses dias ou puxar janelas para os dias com folga.`, sources: [{ name: "ib_capacity", at: now }] };
    }
    return null;
  }

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: "user", content: question }]); setQ(""); setBusy(true);
    trackAction(tenant!.id, user?.id ?? null, "zeus.ask");
    const local = localAnswer(question);
    try {
      const context = {
        today: (appts.data || []).filter((a) => new Date(a.starts_at).toDateString() === bizDay(0).toDateString()).slice(0, 60).map((a) => ({ hora: fmtHM(a.starts_at), doca: a.dock_code, fornecedor: a.supplier_name, po: a.po_number, material: a.material, status: a.status, eta: a.eta_at ? fmtHM(a.eta_at) : null, placa: a.vehicle_plate })),
        pos: (pos.data || []).slice(0, 60).map((p) => ({ po: p.po_number, fornecedor: p.supplier_short, material: p.material, origem: p.origin, cobertura_dias: p.coverage_days, free_time_ate: p.free_time_until, navio_atraso_dias: p.vessel_delay_days, eta: p.eta, janelas: p.appointments })),
        liberados: (rel.data || []).map((r) => ({ conteiner: r.container_no, free_time_dias: r.free_time_days, situacao: r.status })),
        capacidade: cap.data || [],
      };
      const { data, error } = await supabase.functions.invoke("zeus", { body: { question, context, tenant_id: tenant!.id, history: msgs.slice(-6) } });
      if (error || !data?.answer) throw error || new Error("sem resposta");
      setMsgs((m) => [...m, { role: "assistant", content: data.answer, sources: data.sources || [{ name: "dados do dia", at: stamp() }], model: data.model }]);
    } catch {
      setMsgs((m) => [...m, local || { role: "assistant", content: "Não encontrei isso nos dados de hoje. Posso responder sobre chegadas, janelas livres, free time e demurrage, navios atrasados e capacidade.", sources: [{ name: "sem fonte", at: stamp() }] }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="max-w-[900px]">
      <PageHeader eyebrow="zeus · inteligência na mão de quem agenda" title="Zeus" lead="Pergunte em português. Toda resposta traz a fonte e a hora do dado. O Zeus responde ao fornecedor e à analista pelo WhatsApp com a mesma base." />
      <div className="flex flex-wrap gap-1.5 mb-3">{CHIPS.map((c) => <button key={c} onClick={() => void ask(c)} className="chip hover:bg-surface-3 text-[12.5px] font-semibold">{c}</button>)}</div>
      <Card>
        <CardBody className="pt-4">
          <div ref={box} className="h-[52vh] overflow-y-auto scrollbar-thin space-y-3 pr-1">
            {msgs.length === 0 && <div className="text-[13px] text-muted">Comece por uma das perguntas acima ou escreva a sua.</div>}
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-[12px] px-3.5 py-2.5 text-[13.5px] whitespace-pre-line", m.role === "user" ? "bg-surface-3" : "bg-brand-tint border border-brand-line")}>
                  {m.role === "assistant" && <div className="flex items-center gap-1.5 text-brand-ink font-bold text-xs mb-1"><Zap className="size-3.5" /> Zeus</div>}
                  {m.content}
                  {m.sources && <div className="mt-2 text-[11px] text-muted">fonte: {m.sources.map((s) => `${s.name} · ${s.at}`).join(" · ")}{m.model ? ` · ${m.model}` : ""}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-xs text-muted"><Spinner /> Zeus consultando os dados</div>}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: quantos contêineres liberados ainda não têm janela?" />
            <Button type="submit" variant="primary" disabled={busy}><Send /> Perguntar</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
