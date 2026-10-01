import * as React from "react";
import { Routes, Route, Navigate, Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Plus, ArrowLeft, LogIn, Factory, DoorOpen, Users, CreditCard, ShieldAlert, Mail, Search, Trash2, ScrollText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { Card, CardHeader, CardBody, Chip, Kpi, Empty } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/input";
import { Switch, PageHeader, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, fmtDMY, relTime, isPersonalEmail } from "@/lib/utils";

// ---------------------------------------------------------------------
// Tipos e utilitários
// ---------------------------------------------------------------------
interface PT {
  id: string; slug: string; name: string; legal_name: string | null; solution: string; product_name: string; brand_mode: "z3us" | "white";
  status: string; demo: boolean; created_at: string; plants: number; gates: number; members: number; invites_pending: number;
  billing_status: string | null; billing_amount_cents: number | null; billing_overdue_since: string | null; last_activity_at: string | null;
}
const STATUS: Record<string, { label: string; kind: "ok" | "info" | "warn" | "default" | "crit" }> = {
  trial: { label: "Trial", kind: "info" }, active: { label: "Ativo", kind: "ok" }, suspended: { label: "Suspenso", kind: "warn" }, closed: { label: "Encerrado", kind: "default" },
};
const ROLE_LABEL: Record<string, string> = { tenant_admin: "Admin do tenant", operator: "Operador", viewer: "Leitura", external: "Externo" };
const KIND_LABEL: Record<string, string> = { plataforma: "Plataforma", unidade: "Unidade", portaria: "Portaria", usuario: "Usuário", modulo: "Módulo" };
const brl = (cents: number | null | undefined) => cents ? (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Tabela";
const parseBRL = (s: string) => { const n = Number(String(s).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
export function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " e ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
const SLUG_RE = /^[a-z0-9-]{2,40}$/;

function usePlatformTenants() {
  return useQuery({ queryKey: ["platform_tenants"], queryFn: async () => { const { data, error } = await supabase.rpc("platform_tenants"); if (error) throw error; return (data || []) as PT[]; } });
}

// ---------------------------------------------------------------------
// Módulo
// ---------------------------------------------------------------------
export default function Gestao() {
  const { profile, loading } = useSession();
  if (loading) return <div className="p-10 grid place-items-center"><Spinner /></div>;
  if (!profile?.is_platform_admin) return <Navigate to="/app/hoje" replace />;
  return (
    <Routes>
      <Route index element={<Tenants />} />
      <Route path="novo" element={<NovoTenant />} />
      <Route path=":id" element={<TenantDetail />} />
    </Routes>
  );
}

// ---------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------
function Tenants() {
  const q = usePlatformTenants();
  const [filter, setFilter] = React.useState("");
  const rows = (q.data || []).filter((t) => !filter || (t.name + " " + t.slug + " " + (t.legal_name || "")).toLowerCase().includes(filter.toLowerCase()));
  const all = q.data || [];
  const n = (s: string) => all.filter((t) => t.status === s).length;
  const overdue = all.filter((t) => t.billing_status && t.billing_status !== "ok").length;
  return (
    <div>
      <PageHeader eyebrow="gestão Z3US · plataforma" title="Gestão Z3US" lead="Clientes da plataforma: cada um é um tenant, com suas unidades e portarias (a condicional de preço), seus usuários e sua conta. Só o admin da plataforma vê esta tela."
        actions={<Button variant="primary" asChild><Link to="/gestao/novo"><Plus /> Novo tenant</Link></Button>} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Kpi label="Tenants" value={all.length} sub={`${n("active")} ativos · ${n("trial")} em trial`} tone="brand" />
        <Kpi label="Suspensos" value={n("suspended")} sub={n("closed") ? `${n("closed")} encerrados` : "nenhum encerrado"} tone={n("suspended") ? "warn" : undefined} />
        <Kpi label="Unidades" value={all.reduce((s, t) => s + t.plants, 0)} sub="plantas cadastradas" />
        <Kpi label="Portarias" value={all.reduce((s, t) => s + t.gates, 0)} sub="ativas" />
        <Kpi label="Em atraso" value={overdue} sub={overdue ? "contas com pendência" : "todas as contas em dia"} tone={overdue ? "crit" : "ok"} />
      </div>
      <Card>
        <CardHeader title="Tenants" eyebrow="cliente · status · unidades · usuários · billing" actions={
          <div className="relative"><Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" /><Input className="pl-8 h-8 w-[220px]" placeholder="Buscar cliente ou slug" value={filter} onChange={(e) => setFilter(e.target.value)} /></div>
        } />
        <CardBody>
          {q.isLoading ? <div className="py-8 grid place-items-center"><Spinner /></div> : rows.length === 0 ? (
            <Empty title={all.length === 0 ? "Nenhum tenant ainda" : "Nada com esse filtro"} hint={all.length === 0 ? "Crie o primeiro cliente da plataforma." : undefined} action={all.length === 0 ? <Button variant="primary" asChild><Link to="/gestao/novo"><Plus /> Novo tenant</Link></Button> : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl"><thead><tr><th>Cliente</th><th>Status</th><th>Marca</th><th>Unid.</th><th>Port.</th><th>Usuários</th><th>Billing</th><th>Último acesso</th><th></th></tr></thead><tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={cn(t.status === "closed" && "opacity-60")}>
                    <td><Link to={`/gestao/${t.id}`} className="font-bold hover:underline">{t.name}</Link><div className="text-xs text-muted mono">/t/{t.slug}{t.legal_name ? ` · ${t.legal_name}` : ""}</div></td>
                    <td><Chip kind={STATUS[t.status]?.kind || "default"}>{STATUS[t.status]?.label || t.status}</Chip>{t.demo && <div className="text-[10.5px] text-muted mt-0.5">demonstração</div>}</td>
                    <td className="text-xs">{t.brand_mode === "white" ? "White label" : "Z3US"}<div className="text-muted">{t.product_name}</div></td>
                    <td className="mono">{t.plants}</td>
                    <td className="mono">{t.gates}</td>
                    <td className="mono">{t.members}{t.invites_pending ? <span className="text-xs text-muted"> +{t.invites_pending} conv.</span> : null}</td>
                    <td>{t.billing_status ? <Chip kind={t.billing_status === "ok" ? "ok" : "crit"}>{t.billing_status === "ok" ? "em dia" : t.billing_status === "overdue" ? `atraso desde ${fmtDMY(t.billing_overdue_since)}` : "bloqueado"}</Chip> : <span className="text-xs text-muted">sem conta</span>}<div className="text-xs text-muted mono">{brl(t.billing_amount_cents)}</div></td>
                    <td className="text-xs text-muted">{t.last_activity_at ? relTime(t.last_activity_at) : "nunca"}</td>
                    <td className="text-right whitespace-nowrap"><Button size="sm" asChild><Link to={`/gestao/${t.id}`}>Abrir</Link></Button></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// Novo tenant
// ---------------------------------------------------------------------
type Gate = { code: string; name: string };
type Item = { kind: string; description: string; qty: number; price: string };

function NovoTenant() {
  const nav = useNavigate(); const qc = useQueryClient(); const { refresh } = useSession();
  const [f, setF] = React.useState({ name: "", legal_name: "", slug: "", email_domains: "", product_name: "Inbound 360", brand_mode: "z3us", accent_color: "", logo_url: "", status: "trial", demo: false, admin_email: "", login_tagline: "", plant_code: "", plant_name: "", plant_address: "", open: "06:00", close: "22:00", plan: "assinatura", amount: "", period: "monthly", closing_day: "30", report_to_email: "" });
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [gates, setGates] = React.useState<Gate[]>([{ code: "P1", name: "Portaria 1" }]);
  const [items, setItems] = React.useState<Item[]>([{ kind: "plataforma", description: "Plataforma Inbound 360", qty: 1, price: "" }, { kind: "unidade", description: "Unidade", qty: 1, price: "" }, { kind: "portaria", description: "Portarias", qty: 1, price: "" }]);
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const setName = (v: string) => setF((s) => ({ ...s, name: v, slug: slugTouched ? s.slug : slugify(v) }));
  const gatesActive = gates.filter((g) => g.code.trim()).length;

  React.useEffect(() => { setItems((it) => it.map((i) => i.kind === "portaria" ? { ...i, qty: gatesActive } : i.kind === "unidade" ? { ...i, qty: f.plant_code.trim() ? 1 : 0 } : i)); }, [gatesActive, f.plant_code]);

  const problems: string[] = [];
  if (!f.name.trim()) problems.push("nome do cliente");
  if (!SLUG_RE.test(f.slug)) problems.push("slug válido (letras minúsculas, números e hífen, 2 a 40)");
  if (f.admin_email && isPersonalEmail(f.admin_email)) problems.push("e-mail corporativo para o administrador");
  if (f.admin_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.admin_email)) problems.push("e-mail do administrador bem formado");
  const domains = f.email_domains.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (f.admin_email && domains.length && !domains.includes(f.admin_email.toLowerCase().split("@")[1] || "")) problems.push("administrador em um dos domínios permitidos (ou deixe os domínios em branco)");

  async function submit() {
    if (problems.length) return toast.error("Falta: " + problems.join("; "));
    setBusy(true);
    const payload = {
      name: f.name.trim(), legal_name: f.legal_name.trim(), slug: f.slug, email_domains: domains, product_name: f.product_name.trim() || "Inbound 360",
      brand_mode: f.brand_mode, accent_color: f.accent_color.trim(), logo_url: f.logo_url.trim(), status: f.status, demo: f.demo, admin_email: f.admin_email.trim(),
      identity: f.login_tagline.trim() ? { login_tagline: f.login_tagline.trim() } : {},
      plant: f.plant_code.trim() ? { code: f.plant_code.trim(), name: f.plant_name.trim(), address: f.plant_address.trim(), open_time: f.open, close_time: f.close, gates: gates.filter((g) => g.code.trim()) } : null,
      items: items.filter((i) => i.qty > 0 && (f.plant_code.trim() || !["unidade", "portaria"].includes(i.kind))).map((i) => ({ kind: i.kind, description: i.description.trim(), qty: i.qty, unit_price_cents: parseBRL(i.price) })),
      billing: { plan: f.plan.trim() || "assinatura", amount_cents: parseBRL(f.amount), period: f.period, closing_day: Number(f.closing_day) || 30, report_to_email: f.report_to_email.trim() },
    };
    const { data, error } = await supabase.rpc("create_tenant", { p: payload });
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data as { tenant_id: string; slug: string; gates: number; items: number; invite_id: string | null };
    toast.success(`Tenant ${r.slug} criado${r.invite_id ? ". O administrador entra sozinho ao criar a conta com o e-mail convidado." : "."}`);
    qc.invalidateQueries({ queryKey: ["platform_tenants"] }); void refresh();
    nav(`/gestao/${r.tenant_id}`);
  }

  return (
    <div>
      <PageHeader eyebrow="gestão Z3US · novo cliente" title="Novo tenant" lead="Uma transação só: cliente, marca, primeira unidade com portarias, conta de billing e o convite do primeiro administrador."
        actions={<Button variant="ghost" asChild><Link to="/gestao"><ArrowLeft /> Voltar</Link></Button>} />
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader title="Cliente" eyebrow="quem é o tenant" /><CardBody className="space-y-3">
          <Field label="Nome"><Input value={f.name} onChange={(e) => setName(e.target.value)} placeholder="Nortex Consumo" autoFocus /></Field>
          <Field label="Razão social"><Input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} placeholder="Nortex Consumo Ltda" /></Field>
          <Field label="Slug (link de login)" hint={`Login com marca em inbound.z3us.app/t/${f.slug || "slug"}`}><Input className="mono" value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} placeholder="nortex" /></Field>
          <Field label="Domínios de e-mail permitidos" hint="Separados por vírgula. E-mail pessoal é sempre bloqueado. Em branco: qualquer domínio corporativo."><Input value={f.email_domains} onChange={(e) => set("email_domains", e.target.value)} placeholder="nortex.com.br, nortex.com" /></Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Status inicial"><Select value={f.status} onChange={(e) => set("status", e.target.value)}><option value="trial">Trial</option><option value="active">Ativo</option></Select></Field>
            <div className="pt-6"><Switch checked={f.demo} onCheckedChange={(v) => set("demo", v)} label="Tenant de demonstração (dados fictícios)" /></div>
          </div>
        </CardBody></Card>

        <Card><CardHeader title="Produto e marca" eyebrow="marca Z3US ou white label" /><CardBody className="space-y-3">
          <Field label="Nome do produto"><Input value={f.product_name} onChange={(e) => set("product_name", e.target.value)} /></Field>
          <Switch checked={f.brand_mode === "white"} onCheckedChange={(v) => set("brand_mode", v ? "white" : "z3us")} label="White label (marca do cliente)" />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Cor de acento" hint="Só no white label."><Input value={f.accent_color} onChange={(e) => set("accent_color", e.target.value)} placeholder="#003da5" disabled={f.brand_mode !== "white"} /></Field>
            <Field label="Logo oficial (URL)" hint="Arquivo oficial enviado pelo cliente; pode subir depois em Configurações."><Input value={f.logo_url} onChange={(e) => set("logo_url", e.target.value)} disabled={f.brand_mode !== "white"} /></Field>
          </div>
          <Field label="Frase da tela de login"><Input value={f.login_tagline} onChange={(e) => set("login_tagline", e.target.value)} placeholder="Docas, gate e pátio" /></Field>
        </CardBody></Card>

        <Card><CardHeader title="Primeira unidade e portarias" eyebrow="unidade e portaria contam no billing" /><CardBody className="space-y-3">
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <Field label="Código"><Input value={f.plant_code} onChange={(e) => set("plant_code", e.target.value.toUpperCase())} placeholder="ITU" /></Field>
            <Field label="Nome"><Input value={f.plant_name} onChange={(e) => set("plant_name", e.target.value)} placeholder="Itu" /></Field>
          </div>
          <Field label="Endereço"><Input value={f.plant_address} onChange={(e) => set("plant_address", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Abre"><Input type="time" value={f.open} onChange={(e) => set("open", e.target.value)} /></Field><Field label="Fecha"><Input type="time" value={f.close} onChange={(e) => set("close", e.target.value)} /></Field></div>
          <div>
            <div className="eyebrow mb-1.5">Portarias</div>
            {gates.map((g, i) => (
              <div key={i} className="flex gap-2 items-center mb-1.5">
                <Input className="w-20 mono" value={g.code} onChange={(e) => setGates(gates.map((x, k) => k === i ? { ...x, code: e.target.value.toUpperCase() } : x))} placeholder="P1" />
                <Input className="flex-1" value={g.name} onChange={(e) => setGates(gates.map((x, k) => k === i ? { ...x, name: e.target.value } : x))} placeholder="Portaria 1 · carretas" />
                <Button variant="ghost" size="icon" aria-label="Remover" onClick={() => setGates(gates.filter((_, k) => k !== i))}><Trash2 /></Button>
              </div>
            ))}
            <Button size="sm" onClick={() => setGates([...gates, { code: `P${gates.length + 1}`, name: `Portaria ${gates.length + 1}` }])}><Plus /> Portaria</Button>
          </div>
          <p className="text-xs text-muted">Sem código de unidade, o tenant nasce sem unidade e o admin do cliente cadastra depois em Configurações → Unidades.</p>
        </CardBody></Card>

        <Card><CardHeader title="Primeiro administrador" eyebrow="convite por e-mail · entra sozinho no cadastro" /><CardBody className="space-y-3">
          <Field label="E-mail corporativo do administrador do cliente" hint="Fica como convite de admin do tenant por 30 dias. Quando a pessoa cria a conta com esse e-mail (ou se já tem conta), o acesso entra sozinho."><Input value={f.admin_email} onChange={(e) => set("admin_email", e.target.value)} placeholder="nome@cliente.com.br" /></Field>
          <p className="text-[12.5px] text-ink-2 inline-flex items-center gap-2"><Mail className="size-3.5" /> O e-mail de convite sai pelo Resend quando a chave estiver configurada; sem ela, mande o link de login ao cliente.</p>
        </CardBody></Card>

        <Card className="lg:col-span-2"><CardHeader title="Billing" eyebrow="conta e composição por unidade e portaria · valor unitário vem da Tabela Z3US" /><CardBody>
          <div className="grid md:grid-cols-5 gap-3 mb-4">
            <Field label="Plano"><Input value={f.plan} onChange={(e) => set("plan", e.target.value)} /></Field>
            <Field label="Valor do período (R$)" hint="0 = a definir na proposta"><Input value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0,00" /></Field>
            <Field label="Período"><Select value={f.period} onChange={(e) => set("period", e.target.value)}><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option></Select></Field>
            <Field label="Dia de fechamento"><Input type="number" min={1} max={31} value={f.closing_day} onChange={(e) => set("closing_day", e.target.value)} /></Field>
            <Field label="Reporta para (e-mail)"><Input value={f.report_to_email} onChange={(e) => set("report_to_email", e.target.value)} placeholder="financeiro@cliente.com.br" /></Field>
          </div>
          <table className="tbl"><thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Unitário (R$)</th><th></th></tr></thead><tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td><Select className="h-8 py-0" value={it.kind} onChange={(e) => setItems(items.map((x, k) => k === i ? { ...x, kind: e.target.value } : x))}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></td>
                <td><Input className="h-8" value={it.description} onChange={(e) => setItems(items.map((x, k) => k === i ? { ...x, description: e.target.value } : x))} /></td>
                <td><Input className="h-8 w-20 mono" type="number" min={0} value={it.qty} onChange={(e) => setItems(items.map((x, k) => k === i ? { ...x, qty: Number(e.target.value) } : x))} /></td>
                <td><Input className="h-8 w-32 mono" value={it.price} onChange={(e) => setItems(items.map((x, k) => k === i ? { ...x, price: e.target.value } : x))} placeholder="Tabela" /></td>
                <td className="text-right"><Button variant="ghost" size="icon" aria-label="Remover" onClick={() => setItems(items.filter((_, k) => k !== i))}><Trash2 /></Button></td>
              </tr>
            ))}
          </tbody></table>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setItems([...items, { kind: "modulo", description: "", qty: 1, price: "" }])}><Plus /> Item</Button>
            <span className="text-xs text-muted">Unidade e portaria seguem a primeira unidade acima; a quantidade de portarias acompanha a lista.</span>
          </div>
        </CardBody></Card>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void submit()}>{busy ? <Spinner /> : <Building2 />} Criar tenant</Button>
        {problems.length > 0 && <span className="text-[12.5px] text-warn">Falta: {problems.join("; ")}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Detalhe do tenant
// ---------------------------------------------------------------------
function TenantDetail() {
  const { id } = useParams(); const nav = useNavigate(); const qc = useQueryClient(); const { refresh } = useSession();
  const list = usePlatformTenants();
  const row = (list.data || []).find((t) => t.id === id);
  const tenant = useQuery({ queryKey: ["tenant", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("tenants").select("*").eq("id", id!).maybeSingle(); if (error) throw error; return data as any; } });
  const members = useQuery({ queryKey: ["members", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("memberships").select("id, role, status, created_at, user:profiles!memberships_user_id_fkey(email, full_name, last_seen_at)").eq("tenant_id", id!).order("created_at"); if (error) throw error; return data as any[]; } });
  const invites = useQuery({ queryKey: ["invites", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("invites").select("*").eq("tenant_id", id!).is("accepted_at", null).order("created_at", { ascending: false }); if (error) throw error; return data as any[]; } });
  const plants = useQuery({ queryKey: ["plants_all", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("ib_plants").select("id, code, name, address").eq("tenant_id", id!).order("name"); if (error) throw error; return data as any[]; } });
  const gates = useQuery({ queryKey: ["gates_all", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("ib_gates").select("id, plant_id, code, name, active").eq("tenant_id", id!).order("sort"); if (error) throw error; return data as any[]; } });
  const billing = useQuery({ queryKey: ["billing", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("billing_accounts").select("*").eq("tenant_id", id!).maybeSingle(); if (error) throw error; return data as any; } });
  const items = useQuery({ queryKey: ["billing_items_raw", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("billing_items").select("*").eq("tenant_id", id!).eq("active", true).order("created_at"); if (error) throw error; return data as any[]; } });
  const audit = useQuery({ queryKey: ["audit", id], enabled: !!id, queryFn: async () => { const { data, error } = await supabase.from("audit_log").select("action, entity, before, after, created_at").eq("tenant_id", id!).order("created_at", { ascending: false }).limit(12); if (error) throw error; return data as any[]; } });

  const [confirm, setConfirm] = React.useState<null | "closed" | "suspended">(null); const [typed, setTyped] = React.useState("");
  const [inv, setInv] = React.useState({ email: "", role: "tenant_admin" });
  const [acc, setAcc] = React.useState<{ plan: string; amount: string; period: string; closing_day: string; report_to_email: string } | null>(null);
  const [ni, setNi] = React.useState<Item>({ kind: "modulo", description: "", qty: 1, price: "" });
  React.useEffect(() => { const b = billing.data; if (b) setAcc({ plan: b.plan, amount: b.amount_cents ? (b.amount_cents / 100).toFixed(2).replace(".", ",") : "", period: b.period, closing_day: String(b.closing_day), report_to_email: b.report_to_email || "" }); else if (billing.isSuccess) setAcc({ plan: "assinatura", amount: "", period: "monthly", closing_day: "30", report_to_email: "" }); }, [billing.data, billing.isSuccess]);

  const t = tenant.data;
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["platform_tenants"] }); qc.invalidateQueries({ queryKey: ["tenant", id] }); qc.invalidateQueries({ queryKey: ["audit", id] }); };

  async function setStatus(s: string) {
    const { error } = await supabase.rpc("set_tenant_status", { p_tenant: id, p_status: s });
    if (error) return toast.error(error.message);
    toast.success(`Tenant ${STATUS[s]?.label.toLowerCase() || s}`); setConfirm(null); setTyped(""); invalidate(); void refresh();
  }
  async function enter() { nav(`/app/hoje?t=${t.slug}`); await refresh(); }
  async function invite() {
    const email = inv.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast.error("E-mail inválido");
    if (isPersonalEmail(email)) return toast.error("E-mail pessoal não é aceito");
    const { error } = await supabase.from("invites").insert({ tenant_id: id, email, role: inv.role, expires_at: new Date(Date.now() + 30 * 86400000).toISOString() });
    if (error) return toast.error(error.message);
    toast.success(`Convite registrado para ${email}. Entra sozinho ao criar a conta (ou na hora, se já tem conta).`); setInv({ email: "", role: "tenant_admin" });
    qc.invalidateQueries({ queryKey: ["invites", id] }); qc.invalidateQueries({ queryKey: ["members", id] }); invalidate();
  }
  async function saveAccount() {
    if (!acc) return;
    const { error } = await supabase.from("billing_accounts").upsert({ tenant_id: id, plan: acc.plan.trim() || "assinatura", amount_cents: parseBRL(acc.amount), period: acc.period, closing_day: Number(acc.closing_day) || 30, report_to_email: acc.report_to_email.trim() || null });
    if (error) return toast.error(error.message);
    toast.success("Conta salva"); qc.invalidateQueries({ queryKey: ["billing", id] }); invalidate();
  }
  async function billingStatus(status: "ok" | "overdue" | "blocked", since?: string) {
    const { error } = await supabase.rpc("set_billing_status", { p_tenant: id, p_status: status, p_overdue_since: status === "ok" ? null : since || new Date().toISOString().slice(0, 10) });
    if (error) return toast.error(error.message);
    toast(status === "ok" ? "Pendência limpa" : status === "overdue" ? "Marcado em atraso" : "Bloqueado"); qc.invalidateQueries({ queryKey: ["billing", id] }); invalidate();
  }
  async function addItem() {
    if (!ni.description.trim()) return toast.error("Descrição do item");
    const { error } = await supabase.from("billing_items").insert({ tenant_id: id, kind: ni.kind, description: ni.description.trim(), qty: ni.qty, unit_price_cents: parseBRL(ni.price), plant_id: ["unidade", "portaria"].includes(ni.kind) ? plants.data?.[0]?.id ?? null : null });
    if (error) return toast.error(error.message);
    setNi({ kind: "modulo", description: "", qty: 1, price: "" }); qc.invalidateQueries({ queryKey: ["billing_items_raw", id] });
  }
  async function removeItem(itemId: string) {
    const { error } = await supabase.from("billing_items").update({ active: false }).eq("id", itemId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["billing_items_raw", id] });
  }

  if (tenant.isLoading) return <div className="p-10 grid place-items-center"><Spinner /></div>;
  if (!t) return <Empty title="Tenant não encontrado" action={<Button asChild><Link to="/gestao"><ArrowLeft /> Voltar</Link></Button>} />;
  const st = STATUS[t.status] || { label: t.status, kind: "default" as const };
  const total = (items.data || []).reduce((s: number, i: any) => s + Number(i.qty) * Number(i.unit_price_cents), 0);

  return (
    <div>
      <PageHeader eyebrow={`gestão Z3US · tenant /t/${t.slug}`} title={t.name}
        lead={<span className="inline-flex flex-wrap items-center gap-2"><Chip kind={st.kind}>{st.label}</Chip><span>{t.legal_name || ""}</span><span className="text-muted">{t.brand_mode === "white" ? "white label" : "marca Z3US"} · {t.product_name}{t.demo ? " · demonstração" : ""} · criado em {fmtDMY(t.created_at)}</span></span>}
        actions={<>
          <Button variant="ghost" asChild><Link to="/gestao"><ArrowLeft /> Tenants</Link></Button>
          {t.status !== "closed" && <Button onClick={() => void enter()}><LogIn /> Entrar neste tenant</Button>}
          {t.status === "trial" && <Button variant="primary" onClick={() => void setStatus("active")}>Ativar</Button>}
          {t.status === "suspended" && <Button variant="primary" onClick={() => void setStatus("active")}>Reativar</Button>}
          {t.status === "active" && <Button variant="zeus" onClick={() => setConfirm("suspended")}>Suspender</Button>}
          {t.status === "closed" ? <Button variant="zeus" onClick={() => void setStatus("suspended")}>Reabrir como suspenso</Button> : <Button variant="danger" onClick={() => setConfirm("closed")}><ShieldAlert /> Encerrar</Button>}
        </>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi label="Unidades" value={row?.plants ?? plants.data?.length ?? "…"} sub={<span className="inline-flex items-center gap-1"><Factory className="size-3.5" /> plantas</span>} />
        <Kpi label="Portarias ativas" value={row?.gates ?? "…"} sub={<span className="inline-flex items-center gap-1"><DoorOpen className="size-3.5" /> contam no billing</span>} />
        <Kpi label="Usuários" value={row?.members ?? "…"} sub={row?.invites_pending ? `${row.invites_pending} convite(s) pendente(s)` : "sem convites pendentes"} />
        <Kpi label="Billing" value={<span className="text-[18px]">{billing.data ? (billing.data.status === "ok" ? "em dia" : billing.data.status === "overdue" ? "em atraso" : "bloqueado") : "sem conta"}</span>} sub={billing.data ? `${brl(billing.data.amount_cents)} · ${billing.data.period === "monthly" ? "mensal" : billing.data.period}` : "crie a conta abaixo"} tone={billing.data?.status === "ok" ? "ok" : billing.data ? "crit" : undefined} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader title="Usuários e convites" eyebrow="quem entra no tenant" actions={<Users className="size-4 text-muted" />} /><CardBody>
          {(members.data || []).length === 0 ? <div className="text-[13px] text-muted mb-3">Nenhum usuário vinculado ainda.</div> : (
            <table className="tbl mb-3"><thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Último acesso</th></tr></thead><tbody>
              {(members.data || []).map((m: any) => <tr key={m.id}><td><b>{m.user?.full_name || m.user?.email}</b><div className="text-xs text-muted">{m.user?.email}</div></td><td className="text-xs">{ROLE_LABEL[m.role] || m.role}</td><td><Chip kind={m.status === "active" ? "ok" : "default"}>{m.status}</Chip></td><td className="text-xs text-muted">{m.user?.last_seen_at ? relTime(m.user.last_seen_at) : "nunca"}</td></tr>)}
            </tbody></table>
          )}
          {(invites.data || []).length > 0 && <div className="text-xs text-muted mb-3">Convites pendentes: {(invites.data || []).map((i: any) => `${i.email} (${ROLE_LABEL[i.role] || i.role}, até ${fmtDMY(i.expires_at)})`).join("; ")}</div>}
          <div className="flex flex-wrap gap-2 items-end border-t border-line pt-3">
            <Field label="Convidar por e-mail corporativo" className="flex-1 min-w-[220px]"><Input value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} placeholder="nome@cliente.com.br" /></Field>
            <Field label="Perfil" className="w-44"><Select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}><option value="tenant_admin">Admin do tenant</option><option value="operator">Operador</option><option value="viewer">Leitura</option></Select></Field>
            <Button onClick={() => void invite()}><Mail /> Convidar</Button>
          </div>
        </CardBody></Card>

        <Card><CardHeader title="Unidades e portarias" eyebrow="condicional de preço" actions={<Button size="sm" variant="ghost" onClick={() => { nav(`/config/unidades?t=${t.slug}`); void refresh(); }}>Gerenciar no tenant</Button>} /><CardBody>
          {(plants.data || []).length === 0 ? <Empty title="Sem unidade" hint="O admin do cliente cadastra em Configurações → Unidades, ou você entra no tenant e cadastra." /> : (
            <table className="tbl"><thead><tr><th>Código</th><th>Unidade</th><th>Portarias</th></tr></thead><tbody>
              {(plants.data || []).map((p: any) => { const gs = (gates.data || []).filter((g: any) => g.plant_id === p.id); return <tr key={p.id}><td className="mono">{p.code}</td><td><b>{p.name}</b><div className="text-xs text-muted">{p.address}</div></td><td className="text-xs">{gs.length === 0 ? <span className="text-muted">nenhuma</span> : gs.map((g: any) => <span key={g.id} className={cn("chip mr-1 mb-1", !g.active && "opacity-50 line-through")}>{g.code} · {g.name}</span>)}</td></tr>; })}
            </tbody></table>
          )}
        </CardBody></Card>

        <Card><CardHeader title="Conta de billing" eyebrow="plano, apuração, pendência" actions={<CreditCard className="size-4 text-muted" />} /><CardBody className="space-y-3">
          {acc && (<>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Plano"><Input value={acc.plan} onChange={(e) => setAcc({ ...acc, plan: e.target.value })} /></Field>
              <Field label="Valor do período (R$)"><Input value={acc.amount} onChange={(e) => setAcc({ ...acc, amount: e.target.value })} placeholder="0,00" /></Field>
              <Field label="Período"><Select value={acc.period} onChange={(e) => setAcc({ ...acc, period: e.target.value })}><option value="monthly">Mensal</option><option value="quarterly">Trimestral</option><option value="yearly">Anual</option></Select></Field>
              <Field label="Dia de fechamento"><Input type="number" min={1} max={31} value={acc.closing_day} onChange={(e) => setAcc({ ...acc, closing_day: e.target.value })} /></Field>
              <Field label="Reporta para (e-mail)" className="sm:col-span-2"><Input value={acc.report_to_email} onChange={(e) => setAcc({ ...acc, report_to_email: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button variant="primary" onClick={() => void saveAccount()}>Salvar conta</Button>
              {billing.data && (billing.data.status === "ok" ? <Button variant="zeus" onClick={() => void billingStatus("overdue")}>Marcar em atraso (hoje)</Button> : <>
                <Button onClick={() => void billingStatus("ok")}>Limpar pendência</Button>
                {billing.data.status !== "blocked" && <Button variant="danger" onClick={() => void billingStatus("blocked", billing.data.overdue_since)}>Bloquear agora</Button>}
              </>)}
            </div>
            {billing.data?.status !== "ok" && billing.data && <p className="text-xs text-crit">Em atraso desde {fmtDMY(billing.data.overdue_since)}: aviso, barra vermelha e bloqueio seguem os prazos da danger zone do tenant.</p>}
          </>)}
        </CardBody></Card>

        <Card><CardHeader title="Composição do billing" eyebrow="itens por unidade e portaria · unitário da Tabela Z3US" /><CardBody>
          <table className="tbl"><thead><tr><th>Item</th><th>Descrição</th><th>Qtd</th><th>Unitário</th><th>Total</th><th></th></tr></thead><tbody>
            {(items.data || []).map((i: any) => <tr key={i.id}><td className="text-xs">{KIND_LABEL[i.kind] || i.kind}</td><td><b>{i.description}</b></td><td className="mono">{i.qty}</td><td className="mono">{brl(i.unit_price_cents)}</td><td className="mono">{i.unit_price_cents ? brl(i.qty * i.unit_price_cents) : "a definir"}</td><td className="text-right"><Button variant="ghost" size="icon" aria-label="Remover" onClick={() => void removeItem(i.id)}><Trash2 /></Button></td></tr>)}
            <tr><td><Select className="h-8 py-0" value={ni.kind} onChange={(e) => setNi({ ...ni, kind: e.target.value })}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></td><td><Input className="h-8" value={ni.description} onChange={(e) => setNi({ ...ni, description: e.target.value })} placeholder="Novo item" /></td><td><Input className="h-8 w-16 mono" type="number" min={0} value={ni.qty} onChange={(e) => setNi({ ...ni, qty: Number(e.target.value) })} /></td><td><Input className="h-8 w-28 mono" value={ni.price} onChange={(e) => setNi({ ...ni, price: e.target.value })} placeholder="Tabela" /></td><td className="mono text-muted">{ni.qty && parseBRL(ni.price) ? brl(ni.qty * parseBRL(ni.price)) : ""}</td><td className="text-right"><Button size="sm" aria-label="Adicionar item" onClick={() => void addItem()}><Plus /></Button></td></tr>
            <tr><td colSpan={4} className="text-right font-bold">Total do período</td><td className="mono font-bold">{total ? brl(total) : "a definir"}</td><td></td></tr>
          </tbody></table>
        </CardBody></Card>

        <Card className="lg:col-span-2"><CardHeader title="Trilha" eyebrow="auditoria da plataforma neste tenant" actions={<ScrollText className="size-4 text-muted" />} /><CardBody>
          {(audit.data || []).length === 0 ? <div className="text-[13px] text-muted">Nada registrado ainda.</div> : (audit.data || []).map((a: any, k: number) => (
            <div key={k} className="flex flex-wrap gap-3 text-[13px] py-1.5 border-b border-line last:border-0"><span className="mono text-muted w-[130px] shrink-0">{fmtDMY(a.created_at)} {new Date(a.created_at).toTimeString().slice(0, 5)}</span><b className="mono">{a.action}</b><span className="text-muted truncate">{a.before ? `${Object.entries(a.before).map(([k, v]) => `${k}: ${v}`).join(", ")} → ` : ""}{a.after ? Object.entries(a.after).filter(([, v]) => v !== null && v !== "").map(([k, v]) => `${k}: ${v}`).join(" · ") : ""}</span></div>
          ))}
        </CardBody></Card>
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) { setConfirm(null); setTyped(""); } }}>
        <DialogContent title={confirm === "closed" ? "Encerrar tenant" : "Suspender tenant"} description={confirm === "closed" ? "Ninguém mais entra e o tenant sai do login. Os dados ficam retidos pelo prazo contratual." : "Ninguém entra até reativar. Nenhum dado é apagado."}>
          <Field label={`Digite ${confirm === "closed" ? "ENCERRAR" : "SUSPENDER"} para confirmar`}><Input value={typed} onChange={(e) => setTyped(e.target.value)} /></Field>
          <div className="mt-4 flex gap-2"><Button variant={confirm === "closed" ? "danger" : "zeus"} disabled={typed !== (confirm === "closed" ? "ENCERRAR" : "SUSPENDER")} onClick={() => void setStatus(confirm!)}>Confirmar</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Cancelar</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
