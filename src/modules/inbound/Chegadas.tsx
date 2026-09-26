import * as React from "react";
import { Appt, STATUS_LABEL, useAppointments } from "./data";
import { ApptDrawer } from "./ApptDrawer";
import { Card, CardHeader, CardBody, Chip, Empty } from "@/components/ui/card";
import { PageHeader, Seg, Spinner } from "@/components/ui/misc";
import { cn, fmtHM, minutesOfDay, dayName } from "@/lib/utils";
import { statusChipKind } from "./Hoje";

export default function Chegadas() {
  const [day, setDay] = React.useState(0);
  const [filter, setFilter] = React.useState<"todas" | "proximas" | "atrasadas">("proximas");
  const [sel, setSel] = React.useState<Appt | null>(null);
  const q = useAppointments(day);
  const nowMin = minutesOfDay(new Date());
  const list = (q.data || []).filter((a) => !["cancelled"].includes(a.status));
  const rows = list.filter((a) => {
    if (day !== 0) return true;
    const s = minutesOfDay(a.starts_at);
    if (filter === "proximas") return a.status !== "completed" && (s >= nowMin - 30 || ["en_route", "at_gate", "in_yard", "at_dock"].includes(a.status));
    if (filter === "atrasadas") return (a.status === "en_route" && a.eta_at && minutesOfDay(a.eta_at) > s) || (["confirmed", "scheduled"].includes(a.status) && nowMin > s + 30);
    return true;
  }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return (
    <div>
      <PageHeader eyebrow="onda A · visibilidade de chegadas" title="Chegadas" lead="Tudo que chega, na ordem da janela, com previsão do motorista e status da portaria. A mesma lista vai para a TV da doca." />
      <Card>
        <CardHeader title={`Chegadas ${dayName(day)}`} actions={<>
          <Seg value={String(day) as "0" | "1"} onChange={(v) => setDay(Number(v))} options={[{ value: "0", label: "Hoje" }, { value: "1", label: "Amanhã" }]} />
          {day === 0 && <Seg value={filter} onChange={setFilter} options={[{ value: "proximas", label: "Próximas" }, { value: "atrasadas", label: "Atrasadas" }, { value: "todas", label: "Todas" }]} />}
        </>} />
        <CardBody>
          {q.isLoading ? <div className="p-6 grid place-items-center"><Spinner /></div> : rows.length === 0 ? <Empty title="Nada nessa lista" hint="Troque o filtro ou o dia." /> : (
            <table className="tbl">
              <thead><tr><th>Janela</th><th>Fornecedor</th><th>Carga</th><th>Doca</th><th>Veículo</th><th>Previsão</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const s = minutesOfDay(a.starts_at); const late = a.eta_at && minutesOfDay(a.eta_at) > s;
                  return (
                    <tr key={a.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => setSel(a)}>
                      <td className={cn("mono text-[15px] font-medium", late && "text-crit")}>{fmtHM(a.starts_at)}</td>
                      <td><div className="font-bold">{a.supplier_name}</div><div className="text-[11.5px] text-muted mono">{a.po_number}</div></td>
                      <td className="text-[12.5px]">{a.material}<div className="text-muted">{a.load_type_name}</div></td>
                      <td className={cn("font-bold", late && "text-crit")}>{a.dock_code || "livre"}</td>
                      <td className="mono text-xs">{a.vehicle_plate || "sem placa"}{a.container_no && <div className="text-muted">{a.container_no}</div>}</td>
                      <td className="text-xs">{a.arrived_at ? <span>chegou {fmtHM(a.arrived_at)}</span> : a.eta_at ? <span className={cn(late && "text-crit font-bold")}>chega {fmtHM(a.eta_at)}{late ? ` (+${minutesOfDay(a.eta_at) - s} min)` : ""}</span> : <span className="text-muted">sem check-in</span>}</td>
                      <td><Chip kind={statusChipKind(a.status)}>{STATUS_LABEL[a.status]}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
      <ApptDrawer appt={sel} onClose={() => setSel(null)} />
    </div>
  );
}
