import * as React from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Building2, Factory, Database, CreditCard, Activity, ShieldAlert, LifeBuoy, BookOpen, HelpCircle, Send, Trash2, RefreshCw, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { Card, CardHeader, CardBody, Chip, Kpi, Empty } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Textarea } from "@/components/ui/input";
import { Switch, PageHeader, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn, fmtDMY, fmtHM, relTime, isPersonalEmail } from "@/lib/utils";
import { useSuppliers, useDocks, useLoadTypes, useGates } from "@/modules/inbound/data";

const TABS = [
  { to: "usuarios", label: "Usuários e perfis", icon: Users, admin: true },
  { to: "tenant", label: "Identidade e marca", icon: Building2, admin: true },
  { to: "unidades", label: "Unidades e portarias", icon: Factory, admin: true },
  { to: "cadastros", label: "Cadastros", icon: Database, admin: true },
  { to: "billing", label: "Billing", icon: CreditCard, admin: true },
  { to: "engajamento", label: "Engajamento", icon: Activity, admin: true },
  { to: "danger", label: "Danger zone", icon: ShieldAlert, admin: true },
  { to: "chamados", label: "Chamados", icon: LifeBuoy },
  { to: "faq", label: "FAQ", icon: HelpCircle },
  { to: "guias", label: "Guias de uso", icon: BookOpen },
];

export default function Config() {
  const { isAdmin } = useSession();
  return (
    <div>
      <PageHeader eyebrow="configurações · padrão Z3US" title="Configurações" lead="O mesmo módulo em toda solução Z3US: acesso, governança, marca, cadastros, billing, engajamento, danger zone, chamados, FAQ e guias." />
      <div className="flex flex-wrap gap-1 mb-4">
        {TABS.filter((t) => !t.admin || isAdmin).map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold", isActive ? "border-brand bg-brand-tint text-brand-ink" : "border-line text-ink-2 hover:bg-surface-3")}><t.icon className="size-3.5" />{t.label}</NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to={isAdmin ? "usuarios" : "chamados"} replace />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="tenant" element={<TenantPage />} />
        <Route path="unidades" element={<Unidades />} />
        <Route path="cadastros" element={<Cadastros />} />
        <Route path="billing" element={<Billing />} />
        <Route path="engajamento" element={<Engajamento />} />
        <Route path="danger" element={<Danger />} />
        <Route path="chamados" element={<Chamados />} />
        <Route path="faq" element={<Faq />} />
        <Route path="guias" element={<Guias />} />
      </Routes>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { tenant_admin: "Admin do tenant", operator: "Operador", viewer: "Leitura", external: "Externo (fornecedor)" };

function Usuarios() {
  const { tenant, isAdmin } = useSession(); const qc = useQueryClient();
  const members = useQuery({ queryKey: ["members", tenant?.id], enabled: !!tenant, queryFn: async () => { const { data, error } = await supabase.from("memberships").select("id, role, status, created_at, user:profiles(email, full_name, last_seen_at)").eq("tenant_id", tenant!.id).order("created_at"); if (error) throw error; return data as any[]; } });
  const invites = useQuery({ queryKey: ["invites", tenant?.id], enabled: !!tenant && isAdmin, queryFn: async () => { const { data, error } = await supabase.from("invites").select("*").eq("tenant_id", tenant!.id).is("accepted_at", null).order("created_at", { ascending: false }); if (error) throw error; return data as any[]; } });
  const ext = useQuery({ queryKey: ["ext", tenant?.id], enabled: !!tenant, queryFn: async () => { const { data, error } = await supabase.from("external_identities").select("*").eq("tenant_id", tenant!.id).order("created_at"); if (error) throw error; return data as any[]; } });
  const [email, setEmail] = React.useState(""); const [role, setRole] = React.useState("operator");
  async function invite() {
    if (!/.+@.+\..+/.test(email)) return toast.error("E-mail inválido");
    if (isPersonalEmail(email)) return toast.error("E-mail pessoal não é aceito. Use o e-mail corporativo.");
    const { error } = await supabase.from("invites").insert({ tenant_id: tenant!.id, email, role });
    if (error) return toast.error(error.message);
    toast.success(`Convite registrado para ${email}. Ao criar a conta com esse e-mail, o acesso entra sozinho.`); setEmail(""); qc.invalidateQueries({ queryKey: ["invites"] });
  }
  async function setStatus(id: string, status: string) { const { error } = await supabase.from("memberships").update({ status }).eq("id", id); if (error) return toast.error(error.message); qc.invalidateQueries({ queryKey: ["members"] }); toast.success(status === "disabled" ? "Acesso desativado" : "Acesso reativado"); }
  async function setRoleOf(id: string, r: string) { const { error } = await supabase.from("memberships").update({ role: r }).eq("id", id); if (error) return toast.error(error.message); qc.invalidateQueries({ queryKey: ["members"] }); }
  async function revoke(id: string) { const { error } = await supabase.from("external_identities").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", id); if (error) return toast.error(error.message); qc.invalidateQueries({ queryKey: ["ext"] }); toast.success("Identidade revogada. O acesso morre na hora."); }
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
      <Card>
        <CardHeader title="Membros" eyebrow="e-mail corporativo, perfis e desativação em um clique" />
        <CardBody>
          {members.isLoading ? <Spinner /> : (
            <table className="tbl"><thead><tr><th>Usuário</th><th>Perfil</th><th>Último acesso</th><th>Status</th><th></th></tr></thead><tbody>
              {(members.data || []).map((m) => (
                <tr key={m.id}><td><b>{m.user?.full_name || m.user?.email}</b><div className="text-xs text-muted">{m.user?.email}</div></td>
                  <td>{isAdmin ? <Select className="py-1 w-auto" value={m.role} onChange={(e) => void setRoleOf(m.id, e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select> : ROLE_LABEL[m.role]}</td>
                  <td className="text-xs text-muted">{m.user?.last_seen_at ? relTime(m.user.last_seen_at) : "nunca"}</td>
                  <td><Chip kind={m.status === "active" ? "ok" : "crit"}>{m.status === "active" ? "ativo" : m.status === "invited" ? "convidado" : "desativado"}</Chip></td>
                  <td className="text-right">{isAdmin && <Button size="sm" variant={m.status === "active" ? "danger" : "default"} onClick={() => void setStatus(m.id, m.status === "active" ? "disabled" : "active")}>{m.status === "active" ? "Desativar" : "Reativar"}</Button>}</td></tr>
              ))}
            </tbody></table>
          )}
        </CardBody>
      </Card>
      <div className="space-y-4">
        {isAdmin && (
          <Card><CardHeader title="Convidar" /><CardBody className="space-y-3">
            <Field label="E-mail corporativo"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@pg.com" /></Field>
            <Field label="Perfil"><Select value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
            <Button variant="primary" onClick={() => void invite()}><Send /> Registrar convite</Button>
            {(invites.data || []).length > 0 && <div className="text-xs text-muted">Pendentes: {(invites.data || []).map((i) => i.email).join(", ")}</div>}
            <p className="text-xs text-muted">Senha com no mínimo 12 caracteres, maiúscula, minúscula, número e símbolo. SSO Microsoft e Google entram quando as credenciais forem cadastradas.</p>
          </CardBody></Card>
        )}
        <Card><CardHeader title="Identidades externas" eyebrow="fornecedores e brokers · expiram por inatividade" /><CardBody>
          {(ext.data || []).length === 0 ? <div className="text-xs text-muted">Nenhuma.</div> : (ext.data || []).map((e) => (
            <div key={e.id} className="flex items-center gap-2 py-2 border-b border-line last:border-0 text-[13px]"><div className="min-w-0"><b>{e.name || e.email}</b><div className="text-xs text-muted truncate">{e.email} · {e.kind} · {e.last_access_at ? "acesso " + relTime(e.last_access_at) : "sem acesso ainda"} · expira {e.inactivity_days} d sem uso</div></div>
              <span className="ml-auto"><Chip kind={e.status === "active" ? "ok" : "crit"}>{e.status}</Chip></span>{isAdmin && e.status === "active" && <Button size="sm" variant="danger" onClick={() => void revoke(e.id)}>Revogar</Button>}</div>
          ))}
        </CardBody></Card>
      </div>
    </div>
  );
}

function Unidades() {
  const { tenant, plants, plant, setPlant, refresh } = useSession(); const qc = useQueryClient();
  const gates = useGates(); const docks = useDocks();
  const [np, setNp] = React.useState({ code: "", name: "", address: "", open: "06:00", close: "22:00" });
  const [ng, setNg] = React.useState({ code: "", name: "" });
  async function addPlant() {
    if (!np.code || !np.name) return toast.error("Código e nome da unidade");
    const { error } = await supabase.from("ib_plants").insert({ tenant_id: tenant!.id, code: np.code.toUpperCase(), name: np.name, address: np.address || null, open_time: np.open, close_time: np.close });
    if (error) return toast.error(error.message);
    toast.success("Unidade criada. Cadastre as portarias, docas e tipos de carga dela."); setNp({ code: "", name: "", address: "", open: "06:00", close: "22:00" }); await refresh();
  }
  async function addGate() {
    if (!plant) return; if (!ng.code || !ng.name) return toast.error("Código e nome da portaria");
    const { error } = await supabase.from("ib_gates").insert({ tenant_id: tenant!.id, plant_id: plant.id, code: ng.code.toUpperCase(), name: ng.name });
    if (error) return toast.error(error.message);
    toast.success("Portaria criada"); setNg({ code: "", name: "" }); qc.invalidateQueries({ queryKey: ["gates"] });
  }
  async function toggleGate(id: string, active: boolean) { await supabase.from("ib_gates").update({ active }).eq("id", id); qc.invalidateQueries({ queryKey: ["gates"] }); }
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4">
      <Card><CardHeader title="Unidades" eyebrow="cada unidade tem suas portarias, docas, regras e pátio · conta no billing" /><CardBody>
        <table className="tbl"><thead><tr><th>Código</th><th>Unidade</th><th>Horário</th><th>Docas</th><th></th></tr></thead><tbody>
          {plants.map((p) => <tr key={p.id} className={cn(plant?.id === p.id && "bg-surface-2")}><td className="mono">{p.code}</td><td><b>{p.name}</b><div className="text-xs text-muted">{p.address}</div></td><td className="mono text-xs">{p.open_time.slice(0, 5)} às {p.close_time.slice(0, 5)}</td><td className="mono">{plant?.id === p.id ? docks.data?.length ?? "…" : ""}</td><td className="text-right">{plant?.id !== p.id && <Button size="sm" onClick={() => setPlant(p.id)}>Selecionar</Button>}</td></tr>)}
        </tbody></table>
        <div className="mt-4 border-t border-line pt-3">
          <div className="eyebrow mb-2">Portarias da unidade {plant?.name}</div>
          {(gates.data || []).map((g) => <div key={g.id} className="flex items-center gap-2 py-1.5 border-b border-line last:border-0 text-[13px]"><span className="mono">{g.code}</span><b>{g.name}</b><span className="ml-auto"><Switch checked={g.active} onCheckedChange={(v) => void toggleGate(g.id, v)} label={g.active ? "ativa" : "inativa"} /></span></div>)}
          <div className="mt-2 flex flex-wrap gap-2 items-end">
            <Field label="Código" className="w-24"><Input value={ng.code} onChange={(e) => setNg({ ...ng, code: e.target.value })} placeholder="P3" /></Field>
            <Field label="Nome" className="flex-1 min-w-[180px]"><Input value={ng.name} onChange={(e) => setNg({ ...ng, name: e.target.value })} placeholder="Portaria 3 · contêineres" /></Field>
            <Button onClick={() => void addGate()}>Adicionar portaria</Button>
          </div>
        </div>
      </CardBody></Card>
      <Card><CardHeader title="Nova unidade" /><CardBody className="space-y-2">
        <div className="grid grid-cols-[90px_1fr] gap-2"><Field label="Código"><Input value={np.code} onChange={(e) => setNp({ ...np, code: e.target.value })} placeholder="MAN" /></Field><Field label="Nome"><Input value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} placeholder="Manaus" /></Field></div>
        <Field label="Endereço"><Input value={np.address} onChange={(e) => setNp({ ...np, address: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Abre"><Input type="time" value={np.open} onChange={(e) => setNp({ ...np, open: e.target.value })} /></Field><Field label="Fecha"><Input type="time" value={np.close} onChange={(e) => setNp({ ...np, close: e.target.value })} /></Field></div>
        <Button variant="primary" onClick={() => void addPlant()}>Criar unidade</Button>
        <p className="text-xs text-muted">Unidade e portaria entram na conta do tenant. Valor unitário vem da Tabela Z3US.</p>
      </CardBody></Card>
    </div>
  );
}

function TenantPage() {
  const { tenant, settings, refresh } = useSession(); const qc = useQueryClient();
  const [f, setF] = React.useState({ name: tenant?.name || "", product_name: tenant?.product_name || "", brand_mode: tenant?.brand_mode || "z3us", accent_color: tenant?.accent_color || "", logo_url: tenant?.logo_url || "", email_domains: (tenant?.email_domains || []).join(", ") });
  const [id, setId] = React.useState({ og_title: settings?.identity?.og_title || "", og_description: settings?.identity?.og_description || "", login_tagline: settings?.identity?.login_tagline || "", login_art_url: settings?.identity?.login_art_url || "" });
  React.useEffect(() => { if (tenant) setF({ name: tenant.name, product_name: tenant.product_name, brand_mode: tenant.brand_mode, accent_color: tenant.accent_color || "", logo_url: tenant.logo_url || "", email_domains: tenant.email_domains.join(", ") }); }, [tenant]);
  async function save() {
    const { error } = await supabase.from("tenants").update({ name: f.name, product_name: f.product_name, brand_mode: f.brand_mode, accent_color: f.accent_color || null, logo_url: f.logo_url || null, email_domains: f.email_domains.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) }).eq("id", tenant!.id);
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase.from("tenant_settings").upsert({ tenant_id: tenant!.id, identity: { ...(settings?.identity || {}), ...id } });
    if (e2) return toast.error(e2.message);
    toast.success("Identidade salva"); await refresh(); qc.invalidateQueries();
  }
  async function uploadLogo(file: File) {
    const path = `${tenant!.id}/logo-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("brand").upload(path, file, { upsert: true });
    if (error) return toast.error("Bucket 'brand' ainda não existe: " + error.message);
    const { data } = supabase.storage.from("brand").getPublicUrl(path);
    setF({ ...f, logo_url: data.publicUrl }); toast.success("Logo carregado. Salve para aplicar.");
  }
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card><CardHeader title="Tenant e marca" eyebrow="marca Z3US ou white label" /><CardBody className="space-y-3">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Nome do produto"><Input value={f.product_name} onChange={(e) => setF({ ...f, product_name: e.target.value })} /></Field>
        <Field label="Domínios de e-mail permitidos" hint="Separados por vírgula. E-mail pessoal é sempre bloqueado."><Input value={f.email_domains} onChange={(e) => setF({ ...f, email_domains: e.target.value })} /></Field>
        <div className="flex items-center gap-4"><Switch checked={f.brand_mode === "white"} onCheckedChange={(v) => setF({ ...f, brand_mode: v ? "white" : "z3us" })} label="White label (marca do cliente)" /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Cor de acento (white label)"><Input value={f.accent_color} onChange={(e) => setF({ ...f, accent_color: e.target.value })} placeholder="#003da5" /></Field>
          <Field label="Logo oficial do cliente" hint="Só o arquivo oficial enviado pelo cliente."><input type="file" accept="image/*" className="text-xs" onChange={(e) => e.target.files?.[0] && void uploadLogo(e.target.files[0])} /></Field>
        </div>
        {f.logo_url && <img src={f.logo_url} alt="logo" className="h-10 object-contain bg-white rounded-sm p-1" />}
        <Button variant="primary" onClick={() => void save()}>Salvar</Button>
      </CardBody></Card>
      <Card><CardHeader title="Identidade da instalação" eyebrow="favicon, compartilhamento e arte do login" /><CardBody className="space-y-3">
        <Field label="Título ao compartilhar (Open Graph)"><Input value={id.og_title} onChange={(e) => setId({ ...id, og_title: e.target.value })} /></Field>
        <Field label="Descrição ao compartilhar"><Textarea value={id.og_description} onChange={(e) => setId({ ...id, og_description: e.target.value })} /></Field>
        <Field label="Frase da tela de login"><Input value={id.login_tagline} onChange={(e) => setId({ ...id, login_tagline: e.target.value })} /></Field>
        <Field label="Arte conceitual do login (URL)" hint="Gerada pelo prompt padrão da skill: abstrata, sem pessoas, sem texto, laranja em menos de 15%."><Input value={id.login_art_url} onChange={(e) => setId({ ...id, login_art_url: e.target.value })} /></Field>
        <p className="text-xs text-muted">Favicon e ícone de compartilhamento ficam em /favicon.svg e /og.png do build. Trocam junto com o white label.</p>
        <Button variant="primary" onClick={() => void save()}>Salvar</Button>
      </CardBody></Card>
    </div>
  );
}

function Cadastros() {
  const sup = useSuppliers(); const docks = useDocks(); const lts = useLoadTypes(); const { tenant } = useSession(); const qc = useQueryClient();
  const [n, setN] = React.useState({ code: "", name: "", short_name: "", city: "", email_domains: "", max: "2", lead: "24" });
  async function add() {
    if (!n.code || !n.name) return toast.error("Código e nome são obrigatórios");
    const { error } = await supabase.from("ib_suppliers").insert({ tenant_id: tenant!.id, code: n.code.toUpperCase(), name: n.name, short_name: n.short_name || null, city: n.city || null, email_domains: n.email_domains.split(",").map((s) => s.trim()).filter(Boolean), max_windows_per_day: Number(n.max), min_lead_hours: Number(n.lead) });
    if (error) return toast.error(error.message);
    toast.success("Fornecedor cadastrado"); setN({ code: "", name: "", short_name: "", city: "", email_domains: "", max: "2", lead: "24" }); qc.invalidateQueries({ queryKey: ["suppliers"] });
  }
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
      <Card><CardHeader title="Fornecedores e brokers" eyebrow={`${sup.data?.length || 0} cadastrados`} /><CardBody>
        <table className="tbl"><thead><tr><th>Código</th><th>Nome</th><th>Domínios de e-mail</th><th>Janelas/dia</th><th>Ativo</th></tr></thead><tbody>
          {(sup.data || []).map((s) => <tr key={s.id}><td className="mono">{s.code}</td><td><b>{s.name}</b>{s.is_broker && <Chip className="ml-2" kind="info">broker</Chip>}<div className="text-xs text-muted">{s.city}</div></td><td className="text-xs">{s.email_domains.join(", ")}</td><td className="mono">{s.max_windows_per_day}</td><td><Chip kind={s.active ? "ok" : "crit"}>{s.active ? "sim" : "não"}</Chip></td></tr>)}
        </tbody></table>
      </CardBody></Card>
      <div className="space-y-4">
        <Card><CardHeader title="Novo fornecedor" /><CardBody className="space-y-2">
          <div className="grid grid-cols-2 gap-2"><Field label="Código"><Input value={n.code} onChange={(e) => setN({ ...n, code: e.target.value })} /></Field><Field label="Nome curto"><Input value={n.short_name} onChange={(e) => setN({ ...n, short_name: e.target.value })} /></Field></div>
          <Field label="Razão social"><Input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></Field>
          <Field label="Cidade"><Input value={n.city} onChange={(e) => setN({ ...n, city: e.target.value })} /></Field>
          <Field label="Domínios de e-mail (identidade externa)"><Input value={n.email_domains} onChange={(e) => setN({ ...n, email_domains: e.target.value })} placeholder="empresa.com.br" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Janelas/dia"><Input value={n.max} onChange={(e) => setN({ ...n, max: e.target.value })} /></Field><Field label="Antecedência (h)"><Input value={n.lead} onChange={(e) => setN({ ...n, lead: e.target.value })} /></Field></div>
          <Button variant="primary" onClick={() => void add()}>Cadastrar</Button>
          <p className="text-xs text-muted">Importação por CSV: enviar planilha com código, nome, cidade, domínios, janelas/dia, antecedência.</p>
        </CardBody></Card>
        <Card><CardHeader title="Docas e tipos de carga" /><CardBody className="text-[13px]">
          <div className="flex flex-wrap gap-1.5 mb-2">{(docks.data || []).map((d) => <Chip key={d.id}>{d.name} · {d.kind}</Chip>)}</div>
          <div className="flex flex-wrap gap-1.5">{(lts.data || []).map((l) => <Chip key={l.id} kind="info">{l.name} · {l.duration_min} min</Chip>)}</div>
          <p className="mt-2 text-xs text-muted">Edição completa em Regras.</p>
        </CardBody></Card>
      </div>
    </div>
  );
}

function Billing() {
  const { tenant } = useSession();
  const acc = useQuery({ queryKey: ["billing", tenant?.id], enabled: !!tenant, queryFn: async () => { const { data } = await supabase.from("billing_accounts").select("*").eq("tenant_id", tenant!.id).maybeSingle(); return data as any; } });
  const inv = useQuery({ queryKey: ["invoices", tenant?.id], enabled: !!tenant, queryFn: async () => { const { data } = await supabase.from("billing_invoices").select("*").eq("tenant_id", tenant!.id).order("period_start", { ascending: false }); return (data || []) as any[]; } });
  const items = useQuery({ queryKey: ["billing_items", tenant?.id], enabled: !!tenant, queryFn: async () => { const { data } = await supabase.from("billing_summary_v").select("*").eq("tenant_id", tenant!.id); return (data || []) as any[]; } });
  const a = acc.data;
  const total = (items.data || []).reduce((sum: number, i: any) => sum + Number(i.total_cents), 0);
  return (
    <div className="grid lg:grid-cols-[1fr_1.4fr] gap-4">
      <Card><CardHeader title="Conta" eyebrow="plano, apuração e para quem reporta" /><CardBody className="space-y-2 text-[13px]">
        {!a ? <div className="text-muted">Sem conta de billing ainda. O financeiro da Z3US.AI cria no fechamento da proposta.</div> : (<>
          <Row k="Plano" v={a.plan} /><Row k="Valor" v={a.amount_cents ? (a.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: a.currency }) : "a definir na proposta"} />
          <Row k="Período de apuração" v={a.period === "monthly" ? "mensal" : a.period} /><Row k="Fechamento" v={`dia ${a.closing_day}`} /><Row k="Reporta para" v={a.report_to_email || "a definir"} />
          <Row k="Status" v={<Chip kind={a.status === "ok" ? "ok" : "crit"}>{a.status === "ok" ? "em dia" : a.status === "overdue" ? `em atraso desde ${fmtDMY(a.overdue_since)}` : "bloqueado"}</Chip>} />
        </>)}
        <p className="text-xs text-muted pt-2">Vale mesmo em assinatura fixa: o período fecha, o relatório de uso sai para o responsável e a fatura é emitida pelo financeiro.</p>
      </CardBody></Card>
      <div className="space-y-4">
      <Card><CardHeader title="Composição por unidade e portaria" eyebrow="condicional de preço" /><CardBody>
        {(items.data || []).length === 0 ? <div className="text-[13px] text-muted">Sem itens.</div> : (
          <table className="tbl"><thead><tr><th>Item</th><th>Unidade</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr></thead><tbody>
            {(items.data || []).map((i: any, k: number) => <tr key={k}><td><b>{i.description}</b><div className="text-xs text-muted">{i.kind}</div></td><td>{i.plant_name || "tenant"}</td><td className="mono">{i.qty}</td><td className="mono">{i.unit_price_cents ? (i.unit_price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Tabela"}</td><td className="mono">{i.total_cents ? (i.total_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "a definir"}</td></tr>)}
            <tr><td colSpan={4} className="text-right font-bold">Total do período</td><td className="mono font-bold">{total ? (total / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "a definir"}</td></tr>
          </tbody></table>
        )}
      </CardBody></Card>
      <Card><CardHeader title="Faturas" /><CardBody>
        {(inv.data || []).length === 0 ? <Empty title="Nenhuma fatura" hint="Aparecem aqui no fechamento de cada período." /> : (
          <table className="tbl"><thead><tr><th>Período</th><th>Valor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>{(inv.data || []).map((i) => <tr key={i.id}><td>{fmtDMY(i.period_start)} a {fmtDMY(i.period_end)}</td><td className="mono">{(i.amount_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td>{fmtDMY(i.due_date)}</td><td><Chip kind={i.status === "paid" ? "ok" : i.status === "overdue" ? "crit" : "default"}>{i.status}</Chip></td></tr>)}</tbody></table>
        )}
      </CardBody></Card>
      </div>
    </div>
  );
}
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3 py-1.5 border-b border-line last:border-0"><span className="text-muted">{k}</span><span className="font-semibold text-right">{v}</span></div>;

function Engajamento() {
  const { tenant } = useSession();
  const [days, setDays] = React.useState(30);
  const q = useQuery({ queryKey: ["engagement", tenant?.id, days], enabled: !!tenant, queryFn: async () => { const { data, error } = await supabase.rpc("engagement_summary", { p_tenant: tenant!.id, p_days: days }); if (error) throw error; return data as { users: any[]; paths: any[]; days: any[] }; } });
  const d = q.data;
  const totalViews = (d?.days || []).reduce((s: number, x: any) => s + Number(x.views), 0);
  const maxV = Math.max(1, ...(d?.days || []).map((x: any) => Number(x.views)));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><span className="text-[13px] text-muted">Período</span><Select className="w-auto py-1" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></Select></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Telas vistas" value={totalViews} sub={`em ${days} dias`} />
        <Kpi label="Usuários ativos" value={(d?.users || []).filter((u: any) => Number(u.views) > 0).length} sub={`de ${(d?.users || []).length} membros`} />
        <Kpi label="Minutos de uso" value={(d?.users || []).reduce((s: number, u: any) => s + Number(u.minutes), 0)} sub="tempo de tela somado" />
        <Kpi label="Tela mais usada" value={<span className="text-[16px]">{d?.paths?.[0]?.path || "—"}</span>} sub={d?.paths?.[0] ? `${d.paths[0].views} vezes` : ""} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader title="Por usuário" eyebrow="quem acessa, quantas vezes, quanto tempo" /><CardBody>
          <table className="tbl"><thead><tr><th>Usuário</th><th>Perfil</th><th>Telas</th><th>Sessões</th><th>Min</th><th>Último</th></tr></thead><tbody>
            {(d?.users || []).map((u: any) => <tr key={u.email}><td><b>{u.full_name || u.email}</b><div className="text-xs text-muted">{u.email}</div></td><td className="text-xs">{ROLE_LABEL[u.role]}</td><td className="mono">{u.views}</td><td className="mono">{u.sessions}</td><td className="mono">{u.minutes}</td><td className="text-xs text-muted">{u.last_at ? relTime(u.last_at) : "nunca"}</td></tr>)}
          </tbody></table>
        </CardBody></Card>
        <div className="space-y-4">
          <Card><CardHeader title="Por dia" /><CardBody><div className="flex items-end gap-1 h-24">{(d?.days || []).map((x: any) => <div key={x.day} title={`${x.day}: ${x.views} telas, ${x.users} usuários`} className="flex-1 bg-brand rounded-sm min-w-[4px]" style={{ height: (Number(x.views) / maxV) * 100 + "%" }} />)}{(d?.days || []).length === 0 && <div className="text-xs text-muted">Sem eventos ainda.</div>}</div></CardBody></Card>
          <Card><CardHeader title="Telas" /><CardBody>{(d?.paths || []).map((p: any) => <div key={p.path} className="flex justify-between text-[13px] py-1 border-b border-line last:border-0"><span className="mono">{p.path}</span><span className="text-muted">{p.views} · {p.minutes} min</span></div>)}</CardBody></Card>
        </div>
      </div>
      <p className="text-xs text-muted">Logs completos (ação, tela, sessão, duração) ficam em engagement_events e na trilha de auditoria. Retenção: 12 meses.</p>
    </div>
  );
}

function Danger() {
  const { tenant, settings, access, refresh, profile } = useSession(); const qc = useQueryClient();
  const [d, setD] = React.useState({ warn_days: settings?.danger?.warn_days ?? 3, bar_days: settings?.danger?.bar_days ?? 7, block_days: settings?.danger?.block_days ?? 15 });
  const [confirm, setConfirm] = React.useState<null | "close" | "reset">(null); const [typed, setTyped] = React.useState("");
  async function saveDanger() { const { error } = await supabase.from("tenant_settings").upsert({ tenant_id: tenant!.id, danger: d }); if (error) return toast.error(error.message); toast.success("Prazos salvos"); await refresh(); }
  async function simulate(status: "ok" | "overdue", daysAgo = 0) {
    const since = new Date(); since.setDate(since.getDate() - daysAgo);
    const { error } = await supabase.rpc("set_billing_status", { p_tenant: tenant!.id, p_status: status, p_overdue_since: status === "ok" ? null : since.toISOString().slice(0, 10) });
    if (error) return toast.error(error.message); await refresh(); toast(status === "ok" ? "Pendência limpa" : `Inadimplência simulada há ${daysAgo} dias`);
  }
  async function reset() { const { data, error } = await supabase.rpc("reset_demo", { p_slug: tenant!.slug }); if (error) return toast.error(error.message); toast.success(String(data)); qc.invalidateQueries(); setConfirm(null); setTyped(""); }
  async function closeTenant() { const { error } = await supabase.from("tenants").update({ status: "closed" }).eq("id", tenant!.id); if (error) return toast.error(error.message); toast("Tenant encerrado."); await refresh(); }
  async function exportData() {
    const tables = ["ib_suppliers", "ib_purchase_orders", "ib_appointments", "ib_appointment_events", "ib_releases", "tickets", "faq_items"];
    const out: Record<string, unknown> = {};
    for (const t of tables) { const { data } = await supabase.from(t).select("*").eq("tenant_id", tenant!.id); out[t] = data; }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${tenant!.slug}-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  }
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card><CardHeader title="Inadimplência" eyebrow="parametrizado por solução · vira cláusula da proposta" /><CardBody className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Aviso (dias)"><Input type="number" value={d.warn_days} onChange={(e) => setD({ ...d, warn_days: Number(e.target.value) })} /></Field>
          <Field label="Barra vermelha (dias)"><Input type="number" value={d.bar_days} onChange={(e) => setD({ ...d, bar_days: Number(e.target.value) })} /></Field>
          <Field label="Bloqueio (dias)"><Input type="number" value={d.block_days} onChange={(e) => setD({ ...d, block_days: Number(e.target.value) })} /></Field>
        </div>
        <p className="text-[12.5px] text-ink-2">O financeiro marca a pendência (por tela ou por e-mail para a aplicação). No dia do aviso, o admin do tenant é avisado. No dia da barra, todos veem a faixa vermelha. No dia do bloqueio, o acesso para; nenhum dado é apagado.</p>
        <div className="flex flex-wrap gap-2"><Button variant="primary" onClick={() => void saveDanger()}>Salvar prazos</Button>
          {tenant?.demo && <><Button onClick={() => void simulate("overdue", 8)}>Simular atraso de 8 dias</Button><Button onClick={() => void simulate("overdue", 4)}>Simular 4 dias</Button><Button variant="ghost" onClick={() => void simulate("ok")}>Limpar</Button></>}
        </div>
        <div className="text-xs text-muted">Estado atual: <b>{access.mode}</b>{access.days ? ` · ${access.days} dias` : ""}</div>
      </CardBody></Card>
      <Card><CardHeader title="Ações irreversíveis" eyebrow="confirmação por texto" /><CardBody className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void exportData()}><Download /> Exportar dados (JSON)</Button>
          {tenant?.demo && <Button variant="zeus" onClick={() => setConfirm("reset")}><RefreshCw /> Regerar dados de demonstração para hoje</Button>}
          {profile?.is_platform_admin && <Button variant="danger" onClick={() => setConfirm("close")}><Trash2 /> Encerrar tenant</Button>}
        </div>
        <p className="text-xs text-muted">Exclusão definitiva de dados só pelo financeiro da Z3US.AI, depois do encerramento e do prazo de retenção contratual.</p>
      </CardBody></Card>
      <Dialog open={!!confirm} onOpenChange={(o) => { if (!o) { setConfirm(null); setTyped(""); } }}>
        <DialogContent title={confirm === "reset" ? "Regerar dados de demonstração" : "Encerrar tenant"} description={confirm === "reset" ? "Apaga e recria os agendamentos, POs e liberados fictícios com as datas de hoje." : "Ninguém mais entra. Os dados ficam retidos pelo prazo contratual."}>
          <Field label={`Digite ${confirm === "reset" ? "REGERAR" : "ENCERRAR"} para confirmar`}><Input value={typed} onChange={(e) => setTyped(e.target.value)} /></Field>
          <div className="mt-4 flex gap-2"><Button variant={confirm === "reset" ? "primary" : "danger"} disabled={typed !== (confirm === "reset" ? "REGERAR" : "ENCERRAR")} onClick={() => confirm === "reset" ? void reset() : void closeTenant()}>Confirmar</Button><Button variant="ghost" onClick={() => setConfirm(null)}>Cancelar</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Chamados() {
  const { tenant, user, canWrite } = useSession(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tickets", tenant?.id], enabled: !!tenant, queryFn: async () => { const { data, error } = await supabase.from("tickets").select("*, opener:profiles!tickets_opened_by_fkey(email, full_name)").eq("tenant_id", tenant!.id).order("created_at", { ascending: false }); if (error) throw error; return data as any[]; } });
  const faq = useQuery({ queryKey: ["faq", tenant?.id], enabled: !!tenant, queryFn: async () => { const { data } = await supabase.from("faq_items").select("*").or(`tenant_id.eq.${tenant!.id},tenant_id.is.null`); return (data || []) as any[]; } });
  const [f, setF] = React.useState({ title: "", body: "", category: "duvida", priority: "normal" });
  const [sel, setSel] = React.useState<any | null>(null); const [reply, setReply] = React.useState("");
  const match = React.useMemo(() => { const t = (f.title + " " + f.body).toLowerCase(); if (t.trim().length < 6) return null; return (faq.data || []).find((x) => x.question.toLowerCase().split(" ").filter((w: string) => w.length > 4).some((w: string) => t.includes(w))) || null; }, [f, faq.data]);
  async function open() {
    if (!f.title) return toast.error("Dê um título ao chamado");
    const { error } = await supabase.from("tickets").insert({ tenant_id: tenant!.id, opened_by: user!.id, title: f.title, body: f.body, category: f.category, priority: f.priority, faq_match: match?.id || null });
    if (error) return toast.error(error.message); toast.success("Chamado aberto. A Z3US responde por aqui e por e-mail."); setF({ title: "", body: "", category: "duvida", priority: "normal" }); qc.invalidateQueries({ queryKey: ["tickets"] });
  }
  const events = useQuery({ queryKey: ["ticket_events", sel?.id], enabled: !!sel, queryFn: async () => { const { data } = await supabase.from("ticket_events").select("*, actor:profiles(email, full_name)").eq("ticket_id", sel!.id).order("created_at"); return (data || []) as any[]; } });
  async function act(kind: "comment" | "escalation" | "status", body: string, status?: string) {
    await supabase.from("ticket_events").insert({ ticket_id: sel.id, actor_id: user!.id, kind, body });
    if (status) await supabase.from("tickets").update({ status, ...(status === "escalated" ? { escalated_at: new Date().toISOString() } : {}), ...(status === "closed" ? { closed_at: new Date().toISOString() } : {}) }).eq("id", sel.id);
    setReply(""); qc.invalidateQueries({ queryKey: ["tickets"] }); qc.invalidateQueries({ queryKey: ["ticket_events"] }); toast.success("Registrado");
  }
  const PRI: Record<string, "default" | "warn" | "crit"> = { baixa: "default", normal: "default", alta: "warn", critica: "crit" };
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
      <Card><CardHeader title="Chamados" eyebrow="abertura, escalation e relatório do atendimento" /><CardBody>
        {(q.data || []).length === 0 ? <Empty title="Nenhum chamado" hint="Abra um ao lado. Antes, o Zeus procura no FAQ." /> : (
          <table className="tbl"><thead><tr><th>#</th><th>Título</th><th>Quem</th><th>Prioridade</th><th>Status</th><th>Aberto</th></tr></thead><tbody>
            {(q.data || []).map((t) => <tr key={t.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => setSel(t)}><td className="mono">{t.number}</td><td><b>{t.title}</b><div className="text-xs text-muted">{t.category}</div></td><td className="text-xs">{t.opener?.full_name || t.opener?.email}</td><td><Chip kind={PRI[t.priority]}>{t.priority}</Chip></td><td><Chip kind={t.status === "closed" ? "ok" : t.status === "escalated" ? "crit" : t.status === "answered" ? "info" : "warn"}>{t.status}</Chip></td><td className="text-xs text-muted">{relTime(t.created_at)}</td></tr>)}
          </tbody></table>
        )}
      </CardBody></Card>
      <Card><CardHeader title="Abrir chamado" /><CardBody className="space-y-3">
        <Field label="Título"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Descreva"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
        {match && <div className="rounded-sm border border-brand-line bg-brand-tint p-3 text-[12.5px]"><b className="text-brand-ink">Zeus encontrou no FAQ:</b> <b>{match.question}</b><div className="mt-1 text-ink-2">{match.answer}</div></div>}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Categoria"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["duvida", "erro", "acesso", "dado", "melhoria", "financeiro"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Prioridade"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["baixa", "normal", "alta", "critica"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Button variant="primary" onClick={() => void open()}><Send /> Abrir chamado</Button>
      </CardBody></Card>
      <Dialog open={!!sel} onOpenChange={(o) => { if (!o) setSel(null); }}>
        {sel && <DialogContent side="right" title={`#${sel.number} · ${sel.title}`} description={`${sel.category} · ${sel.priority} · ${sel.status}`}>
          <p className="text-[13px] text-ink-2 whitespace-pre-line">{sel.body}</p>
          <div className="mt-4 space-y-2">{(events.data || []).map((e) => <div key={e.id} className="text-[12.5px] border-l-2 border-line pl-2"><b>{e.actor?.full_name || e.actor?.email}</b> <span className="text-muted">· {e.kind} · {fmtHM(e.created_at)}</span><div>{e.body}</div></div>)}</div>
          <div className="mt-4 space-y-2">
            <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Resposta ou atualização" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={!reply} onClick={() => void act("comment", reply, canWrite ? "answered" : undefined)}>Responder</Button>
              {canWrite && sel.status !== "closed" && <Button size="sm" variant="danger" onClick={() => void act("escalation", reply || "Escalado para a Z3US.AI", "escalated")}>Escalar para a Z3US</Button>}
              {sel.status !== "closed" && <Button size="sm" onClick={() => void act("status", reply || "Fechado com relatório do atendimento", "closed")}>Fechar com relatório</Button>}
            </div>
          </div>
        </DialogContent>}
      </Dialog>
    </div>
  );
}

function Faq() {
  const { tenant, isAdmin } = useSession(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ["faq", tenant?.id], enabled: !!tenant, queryFn: async () => { const { data } = await supabase.from("faq_items").select("*").or(`tenant_id.eq.${tenant!.id},tenant_id.is.null`).order("solution"); return (data || []) as any[]; } });
  const [s, setS] = React.useState(""); const [n, setN] = React.useState({ question: "", answer: "" });
  const rows = (q.data || []).filter((x) => !s || (x.question + x.answer).toLowerCase().includes(s.toLowerCase()));
  async function add() { if (!n.question || !n.answer) return; const { error } = await supabase.from("faq_items").insert({ tenant_id: tenant!.id, solution: tenant!.solution, ...n }); if (error) return toast.error(error.message); setN({ question: "", answer: "" }); qc.invalidateQueries({ queryKey: ["faq"] }); toast.success("FAQ atualizado. O Zeus já responde com ele."); }
  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
      <Card><CardHeader title="FAQ" eyebrow="biblioteca da solução e biblioteca comum Z3US" actions={<Input value={s} onChange={(e) => setS(e.target.value)} placeholder="Buscar" className="w-48" />} /><CardBody className="space-y-3">
        {rows.map((x) => <div key={x.id} className="border-b border-line pb-3 last:border-0"><div className="flex items-center gap-2"><b className="text-[13.5px]">{x.question}</b>{!x.tenant_id && <Chip>comum Z3US</Chip>}</div><p className="text-[13px] text-ink-2 mt-1">{x.answer}</p></div>)}
      </CardBody></Card>
      {isAdmin && <Card><CardHeader title="Novo item" /><CardBody className="space-y-2"><Field label="Pergunta"><Input value={n.question} onChange={(e) => setN({ ...n, question: e.target.value })} /></Field><Field label="Resposta"><Textarea value={n.answer} onChange={(e) => setN({ ...n, answer: e.target.value })} /></Field><Button variant="primary" onClick={() => void add()}>Publicar</Button></CardBody></Card>}
    </div>
  );
}

function Guias() {
  const q = useQuery({ queryKey: ["guides"], queryFn: async () => { const { data } = await supabase.from("guides").select("*").order("sort"); return (data || []) as any[]; } });
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {(q.data || []).map((g) => <Card key={g.id}><CardHeader title={g.title} eyebrow={g.route} /><CardBody><p className="text-[13px] text-ink-2 whitespace-pre-line">{g.body_md}</p></CardBody></Card>)}
    </div>
  );
}
