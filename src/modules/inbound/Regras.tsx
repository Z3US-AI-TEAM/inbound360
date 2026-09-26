import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { useRules, useSuppliers, useLoadTypes, useDocks } from "./data";
import { Card, CardHeader, CardBody, Chip } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";

export default function Regras() {
  const { isAdmin } = useSession(); const qc = useQueryClient();
  const rules = useRules(); const sup = useSuppliers(); const lts = useLoadTypes(); const docks = useDocks();
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  async function save(id: string, key: string) {
    const raw = draft[id]; if (raw == null) return;
    let value: any; try { value = JSON.parse(raw); } catch { value = raw; }
    const { error } = await supabase.from("ib_rules").update({ value }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Regra ${key} salva`); qc.invalidateQueries({ queryKey: ["rules"] });
  }
  return (
    <div>
      <PageHeader eyebrow="regras da planta" title="Regras" lead="A regra que hoje mora na cabeça da analista, escrita e versionada. O fornecedor só vê as janelas que a regra permite; o Zeus cita a regra quando sugere." />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Parâmetros da planta" />
          <CardBody>
            <table className="tbl">
              <thead><tr><th>Regra</th><th>Valor</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {(rules.data || []).map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.key}</b><div className="text-xs text-muted">{r.description}</div></td>
                    <td>{isAdmin ? <Input className="mono text-xs" defaultValue={JSON.stringify(r.value)} onChange={(e) => setDraft({ ...draft, [r.id]: e.target.value })} /> : <span className="mono text-xs">{JSON.stringify(r.value)}</span>}</td>
                    {isAdmin && <td><Button size="sm" onClick={() => void save(r.id, r.key)} disabled={draft[r.id] == null}>Salvar</Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Tipos de carga e docas" />
          <CardBody>
            <table className="tbl mb-4">
              <thead><tr><th>Tipo</th><th>Duração</th><th>Veículo</th><th>Fornecedor agenda?</th></tr></thead>
              <tbody>{(lts.data || []).map((l) => <tr key={l.id}><td className="font-bold">{l.name}</td><td className="mono">{l.duration_min} min</td><td>{l.vehicle}</td><td>{l.supplier_can_book ? <Chip kind="ok">sim</Chip> : <Chip>só broker</Chip>}</td></tr>)}</tbody>
            </table>
            <div className="flex flex-wrap gap-2">{(docks.data || []).map((d) => <Chip key={d.id}>{d.name} · {d.kind}</Chip>)}</div>
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Regras por fornecedor" eyebrow="janelas por dia, antecedência, corte e pontualidade" />
          <CardBody>
            <table className="tbl">
              <thead><tr><th>Fornecedor</th><th>Cidade</th><th>Janelas/dia</th><th>Antecedência</th><th>Corte</th><th>Pontualidade</th><th>Contato</th></tr></thead>
              <tbody>{(sup.data || []).map((s) => <tr key={s.id}><td className="font-bold">{s.name}{s.is_broker && <Chip className="ml-2" kind="info">broker</Chip>}</td><td>{s.city} <span className="text-muted">· {s.distance_note}</span></td><td className="mono">{s.max_windows_per_day}</td><td className="mono">{s.min_lead_hours} h</td><td className="mono">{s.cutoff_time.slice(0, 5)}</td><td><Chip kind={(s.punctuality ?? 0) >= 90 ? "ok" : (s.punctuality ?? 0) >= 80 ? "warn" : "crit"}>{s.punctuality ?? "?"}%</Chip></td><td className="text-xs">{s.contact_name}<div className="text-muted mono">{s.contact_phone}</div></td></tr>)}</tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
