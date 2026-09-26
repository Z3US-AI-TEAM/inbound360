import { Card, CardHeader, CardBody, Chip } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";

const ONDAS = [
  { l: "A", t: "Docas", s: "em construção", items: ["Portal do fornecedor com regras e validação de PO", "Grade de docas e fila de prioridade (free time, cobertura, prazo)", "Painel de chegadas e TV da doca", "Notificações por e-mail e WhatsApp", "Zeus para a analista e para o fornecedor", "Dado do SAP por extração diária (com o time de digital)"] },
  { l: "B", t: "Horizonte", s: "desenho", items: ["Navio e ETA por contêiner (Pantheon marítimo)", "Liberação do broker lida do e-mail (Cronos)", "Demurrage por contêiner", "Confirmação de embarque do fornecedor nacional no portal", "Horizonte começa na data da PO"] },
  { l: "C", t: "Portaria, pátio e capacidade", s: "desenho", items: ["Check-in do motorista por link antes de perder o sinal", "Apolo na portaria: placa, foto, checklist, evidência com hora", "Pátio com fila, chamada para a doca e tempo de espera", "Simulação de capacidade: docas, empilhadeiras, operadores, espaço, armazém externo"] },
];

export default function Ondas() {
  return (
    <div>
      <PageHeader eyebrow="roteiro" title="Três ondas, uma arquitetura" lead="Começa pequeno, pelo agendamento, com a arquitetura do OLIMPO 360 embaixo desde o primeiro dia. Escopo, prazo e investimento de cada onda se definem com os volumes reais da planta." />
      <div className="grid md:grid-cols-3 gap-4">
        {ONDAS.map((o) => (
          <Card key={o.l}>
            <CardHeader title={<span className="flex items-center gap-2"><span className="inline-grid place-items-center w-7 h-7 rounded-sm bg-ink text-bg font-bold">{o.l}</span>{o.t}</span>} actions={<Chip kind={o.s === "em construção" ? "brand" : "default"}>{o.s}</Chip>} />
            <CardBody><ul className="space-y-1.5 text-[13px] text-ink-2 list-disc pl-4">{o.items.map((i) => <li key={i}>{i}</li>)}</ul></CardBody>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-muted">O que não entra: integração com órgão público, robô na portaria, substituição do SAP ou do WMS, número de resultado antes de medir com dado real.</p>
    </div>
  );
}
