import * as React from "react";
import { useCapacity, useHorizon } from "./data";
import { Card, CardHeader, CardBody, Chip, Kpi } from "@/components/ui/card";
import { PageHeader, Switch } from "@/components/ui/misc";
import { cn, fmtDMY, num } from "@/lib/utils";

const STAGE: Record<string, { label: string; cls: string }> = {
  pedido: { label: "Pedido (SAP)", cls: "bg-surface-3" },
  embarque: { label: "Embarque", cls: "bg-[var(--mark)]" },
  navio: { label: "Navio", cls: "bg-info" },
  liberacao: { label: "Liberação do broker", cls: "bg-brand" },
  confirma: { label: "Confirmação do fornecedor", cls: "bg-[var(--mark-accent)]" },
  janela: { label: "Janela", cls: "bg-ok" },
};
const D0 = -40, D1 = 60;

export default function Horizonte() {
  const hz = useHorizon(); const cap = useCapacity();
  const [pico, setPico] = React.useState(false);
  const pct = (d: number) => ((d - D0) / (D1 - D0)) * 100;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const dayOf = (s: string) => Math.round((new Date(s + "T12:00:00").getTime() - today.getTime()) / 86400000);
  const byPo = new Map<string, { po: any; segs: any[] }>();
  for (const s of hz.data || []) { const k = s.po_id; if (!byPo.has(k)) byPo.set(k, { po: s.po, segs: [] }); byPo.get(k)!.segs.push(s); }
  const rows = [...byPo.values()].sort((a, b) => Math.min(...a.segs.map((s: any) => dayOf(s.starts_on))) - Math.min(...b.segs.map((s: any) => dayOf(s.starts_on))));
  const late = rows.filter((r) => r.segs.some((s: any) => s.flag)).length;
  const imports = rows.filter((r) => r.po?.origin === "importado").length;
  const capRows = (cap.data || []).map((c) => ({ ...c, demand: pico ? Math.round(c.demand_pallets * 1.35) : c.demand_pallets }));
  const over = capRows.filter((c) => c.demand > c.capacity_pallets);

  return (
    <div>
      <PageHeader eyebrow="onda B · horizonte" title="Horizonte 60 dias" lead="O horizonte começa na PO e no navio, não no agendamento. Os 30 dias que faltavam aparecem aqui: pedido, embarque, navio, liberação e janela, PO por PO. Abaixo, a capacidade da planta por dia." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="POs no horizonte" value={rows.length} sub={`${imports} importadas · ${rows.length - imports} nacionais`} />
        <Kpi label="Com atraso ou risco" value={late} sub={late ? "navio atrasado ou prazo vencido" : "tudo no prazo"} tone={late ? "crit" : "ok"} />
        <Kpi label="Dias de visibilidade" value="60" sub="antes: 30 dias, só quando o armador avisava" tone="brand" />
        <Kpi label="Dias acima da capacidade" value={over.length} sub={pico ? "simulando pico sazonal (+35%)" : "cenário base"} tone={over.length ? "warn" : "ok"} />
      </div>

      <Card className="mb-4">
        <CardHeader title="Linha do tempo por PO" actions={<div className="flex flex-wrap gap-3 text-xs">{Object.entries(STAGE).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><i className={cn("inline-block w-3 h-2 rounded-sm", v.cls)} />{v.label}</span>)}</div>} />
        <CardBody>
          <div className="overflow-x-auto scrollbar-thin">
            <div className="min-w-[900px]">
              <div className="grid" style={{ gridTemplateColumns: "240px 1fr" }}>
                <div />
                <div className="relative h-6 border-b border-line">
                  {[-30, -15, 0, 15, 30, 45, 60].map((d) => <span key={d} className={cn("absolute top-0 mono text-[11px] border-l pl-1", d === 0 ? "text-crit border-crit" : "text-muted border-grid")} style={{ left: pct(d) + "%" }}>{d === 0 ? "hoje" : (d > 0 ? "+" : "") + d + "d"}</span>)}
                </div>
                {rows.map((r) => (
                  <React.Fragment key={r.po?.po_number}>
                    <div className="py-2 pr-3 border-b border-line">
                      <div className="flex items-center gap-2"><span className="mono text-xs">{r.po?.po_number}</span>{r.po?.origin === "importado" ? <Chip kind="info">importado</Chip> : <Chip>nacional</Chip>}</div>
                      <div className="text-[12.5px] font-bold truncate">{r.po?.material}</div>
                      <div className="text-[11.5px] text-muted">{r.po?.supplier?.short_name}{r.segs.find((s: any) => s.note) && <em className={cn("not-italic ml-1", r.segs.some((s: any) => s.flag === "crit") ? "text-crit" : r.segs.some((s: any) => s.flag) ? "text-warn" : "")}>· {r.segs.find((s: any) => s.note)?.note}</em>}</div>
                    </div>
                    <div className="relative border-b border-line h-[62px]">
                      <div className="absolute top-0 bottom-0 w-px bg-crit-fill opacity-70" style={{ left: pct(0) + "%" }} />
                      {r.segs.map((s: any) => {
                        const a = Math.max(D0, dayOf(s.starts_on)), b = Math.min(D1, Math.max(dayOf(s.ends_on), dayOf(s.starts_on) + 0.6));
                        const st = STAGE[s.stage];
                        return <div key={s.id} title={`${st.label}: ${fmtDMY(s.starts_on)} a ${fmtDMY(s.ends_on)}`} className={cn("absolute top-[22px] h-[18px] rounded-sm", st.cls, s.flag === "delay" && "ring-2 ring-warn", s.flag === "crit" && "ring-2 ring-crit", s.stage === "janela" && "w-2")} style={{ left: pct(a) + "%", width: s.stage === "janela" ? undefined : Math.max(0.6, pct(b) - pct(a)) + "%" }} />;
                      })}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Capacidade da planta" eyebrow="pallets por dia · docas, empilhadeiras, operadores e espaço" actions={<Switch checked={pico} onCheckedChange={setPico} label="Simular pico sazonal (+35%)" />} />
        <CardBody>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {capRows.map((c) => {
              const p = Math.round((c.demand / c.capacity_pallets) * 100); const overCap = c.demand > c.capacity_pallets;
              return (
                <div key={c.day} className={cn("rounded border p-2", overCap ? "border-crit bg-crit-tint" : "border-line")}>
                  <div className="text-[11px] text-muted">{fmtDMY(c.day).slice(0, 5)}</div>
                  <div className="h-16 flex items-end mt-1"><div className={cn("w-full rounded-sm", overCap ? "bg-crit-fill" : p > 85 ? "bg-warn-fill" : "bg-ok-fill")} style={{ height: Math.min(100, p) + "%" }} /></div>
                  <div className="mono text-[11px] mt-1">{num(c.demand)}</div>
                  <div className="text-[10px] text-muted">{p}% de {num(c.capacity_pallets)}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[12.5px] text-ink-2">{pico ? `No pico, ${over.length} dia(s) passam da capacidade: é a conta que hoje leva uma semana com o Copilot. Aqui, é uma pergunta ao Zeus: "e se eu usar armazém externo nesses dias?".` : "Cenário base sem pico. Ative a simulação para ver os dias que estouram."}</p>
        </CardBody>
      </Card>
    </div>
  );
}
