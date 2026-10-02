// Notificações transacionais pelo Resend, com registro em public.notifications.
// Layout na identidade Z3US (fundo #0a0a0b, laranja só no filete, no destaque e no botão), tabela para render em Outlook/Gmail.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const FROM_ADDR = Deno.env.get("NOTIFY_FROM_ADDRESS") || "inbound360@hermes.z3us.ai";
const APP_URL = Deno.env.get("APP_URL") || "https://inbound.z3us.app";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

interface Mail { subject: string; preheader: string; eyebrow: string; title: string; lead: string; rows?: [string, string][]; cta?: { label: string; url: string }; note?: string; reason: string }

function layout(m: Mail, product: string, tenant: string) {
  const font = "'Quicksand','Segoe UI',Helvetica,Arial,sans-serif";
  const rows = (m.rows || []).map(([k, v]) => `
    <tr><td style="padding:7px 0;border-bottom:1px solid #26272b;color:#8e9096;font:600 12.5px ${font};width:38%">${esc(k)}</td>
        <td style="padding:7px 0;border-bottom:1px solid #26272b;color:#f4f4f5;font:700 14px ${font}">${esc(v)}</td></tr>`).join("");
  const cta = m.cta ? `
    <tr><td style="padding:22px 0 6px">
      <a href="${esc(m.cta.url)}" style="display:inline-block;background:#f99d28;color:#0a0a0b;text-decoration:none;font:700 14px ${font};padding:12px 22px;border-radius:4px">${esc(m.cta.label)}</a>
      <div style="margin-top:10px;color:#8e9096;font:500 12px ${font}">Se o botão não abrir: <a href="${esc(m.cta.url)}" style="color:#f99d28">${esc(m.cta.url)}</a></div>
    </td></tr>` : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(m.subject)}</title></head>
<body style="margin:0;padding:0;background:#0a0a0b">
<div style="display:none;max-height:0;overflow:hidden;color:#0a0a0b">${esc(m.preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0b"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%">
  <tr><td style="height:3px;background:#f99d28;border-radius:6px 6px 0 0"></td></tr>
  <tr><td style="background:#141416;border:1px solid #26272b;border-top:0;border-radius:0 0 6px 6px;padding:28px 30px">
    <div style="color:#f4f4f5;font:800 18px ${font};letter-spacing:-.2px">${esc(product)}</div>
    <div style="color:#8e9096;font:700 11px ${font};letter-spacing:.06em;text-transform:uppercase;margin-top:2px">${esc(tenant)} · docas, gate e pátio</div>
    <div style="height:1px;background:#26272b;margin:20px 0"></div>
    <div style="color:#f99d28;font:700 11px ${font};letter-spacing:.08em;text-transform:uppercase">${esc(m.eyebrow)}</div>
    <h1 style="margin:6px 0 10px;color:#f4f4f5;font:800 22px/1.25 ${font}">${esc(m.title)}</h1>
    <p style="margin:0;color:#c7c8cc;font:500 14.5px/1.55 ${font}">${esc(m.lead)}</p>
    ${rows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px">${rows}</table>` : ""}
    <table role="presentation" cellspacing="0" cellpadding="0">${cta}</table>
    ${m.note ? `<p style="margin:18px 0 0;color:#8e9096;font:500 12.5px/1.5 ${font}">${esc(m.note)}</p>` : ""}
  </td></tr>
  <tr><td style="padding:16px 8px 0;color:#8e9096;font:500 11.5px/1.6 ${font}">
    ${esc(product)} · tecnologia Z3US.AI · <a href="${APP_URL}/privacidade" style="color:#8e9096">privacidade</a><br>
    Você recebeu este e-mail porque ${esc(m.reason)}. Mensagem automática; não responda.
  </td></tr>
</table></td></tr></table></body></html>`;
}

const TEMPLATES: Record<string, (p: any, product: string, tenant: string) => Mail> = {
  convite: (p, product, tenant) => ({
    subject: `Convite: ${product} · ${tenant}`, preheader: `Seu acesso ao ${product} de ${tenant} está pronto para ser criado.`,
    eyebrow: "convite de acesso", title: `Você foi convidado para o ${product}`,
    lead: `${tenant} liberou seu acesso com o perfil ${p.role || "operador"}. Crie sua conta com este mesmo e-mail e o acesso entra sozinho; e-mail pessoal não é aceito.`,
    rows: [["Cliente", tenant], ["Perfil", p.role || "operador"], ["Login", p.url || APP_URL + "/login"]],
    cta: { label: "Criar minha conta", url: p.url || APP_URL + "/login" },
    note: "Senha com no mínimo 12 caracteres, maiúscula, minúscula, número e símbolo. O convite vale por 30 dias.",
    reason: `um administrador de ${tenant} convidou este endereço`,
  }),
  janela_confirmada: (p, product, tenant) => ({
    subject: `Janela confirmada · ${p.dia} ${p.hora} · ${p.doca}`, preheader: `Entrega da PO ${p.po} confirmada para ${p.dia} às ${p.hora}.`,
    eyebrow: "janela confirmada", title: `${p.dia} às ${p.hora}, ${p.doca}`,
    lead: `${p.fornecedor || "Fornecedor"}, sua entrega da PO ${p.po} está confirmada. O link de check-in do motorista sai 3 horas antes da janela.`,
    rows: [["PO", p.po], ["Dia e hora", `${p.dia} às ${p.hora}`], ["Doca", p.doca], ["Unidade", p.unidade || tenant]],
    cta: p.url ? { label: "Ver no portal", url: p.url } : undefined,
    reason: `você é o contato desta entrega em ${tenant}`,
  }),
  janela_movida: (p, product, tenant) => ({
    subject: `Janela alterada · ${p.dia} ${p.hora} · ${p.doca}`, preheader: `A janela da PO ${p.po} mudou para ${p.dia} às ${p.hora}.`,
    eyebrow: "janela alterada", title: `Nova janela: ${p.dia} às ${p.hora}`,
    lead: `A janela da PO ${p.po} foi movida pela planta. Confirme a nova data com o transportador.`,
    rows: [["PO", p.po], ["Nova janela", `${p.dia} às ${p.hora}`], ["Doca", p.doca], ...(p.motivo ? [["Motivo", p.motivo] as [string, string]] : [])],
    cta: p.url ? { label: "Ver no portal", url: p.url } : undefined,
    reason: `você é o contato desta entrega em ${tenant}`,
  }),
  no_show: (p, product, tenant) => ({
    subject: `No-show registrado · PO ${p.po}`, preheader: `Não houve chegada 30 minutos após a janela de ${p.hora}.`,
    eyebrow: "no-show", title: `Sem chegada na janela das ${p.hora}`,
    lead: `A janela da PO ${p.po} foi marcada como no-show 30 minutos após o horário. Reagende pelo portal; a pontualidade do fornecedor entra na prioridade das próximas janelas.`,
    rows: [["PO", p.po], ["Janela", p.hora], ["Unidade", p.unidade || tenant]],
    cta: p.url ? { label: "Reagendar", url: p.url } : undefined,
    reason: `você é o contato desta entrega em ${tenant}`,
  }),
  inadimplencia: (p, product, tenant) => ({
    subject: `Pendência financeira · ${tenant}`, preheader: `Fatura em aberto há ${p.dias} dias; bloqueio em ${p.bloqueio_em} dias.`,
    eyebrow: "financeiro", title: "Há uma fatura em aberto",
    lead: `A fatura do ${product} está em aberto há ${p.dias} dias. Sem regularização, o acesso será bloqueado em ${p.bloqueio_em} dias; nenhum dado é apagado.`,
    rows: [["Dias em aberto", String(p.dias)], ["Bloqueio em", `${p.bloqueio_em} dias`], ["Contato", "financeiro@z3us.ai"]],
    reason: `você é administrador de ${tenant}`,
  }),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") || "";
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "não autenticado" }, 401);
  const { tenant_id, to, template, payload } = await req.json();
  if (!tenant_id || !to || !template) return json({ error: "tenant_id, to e template são obrigatórios" }, 400);
  const { data: role } = await anon.rpc("my_role", { t: tenant_id });
  if (!role || role === "viewer") return json({ error: "sem permissão" }, 403);
  const t = TEMPLATES[template]; if (!t) return json({ error: "template desconhecido" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tn } = await admin.from("tenants").select("name, product_name").eq("id", tenant_id).maybeSingle();
  const product = payload?.product || tn?.product_name || "Inbound 360";
  const tenant = payload?.tenant || tn?.name || "";
  const mail = t(payload || {}, product, tenant);
  const html = layout(mail, product, tenant);
  const from = Deno.env.get("NOTIFY_FROM") || `${product} <${FROM_ADDR}>`;

  const key = Deno.env.get("RESEND_API_KEY");
  const { data: row } = await admin.from("notifications").insert({ tenant_id, to_email: to, template, subject: mail.subject, payload, status: key ? "queued" : "skipped", error: key ? null : "RESEND_API_KEY ausente" }).select("id").single();
  if (!key) return json({ ok: false, skipped: true, reason: "RESEND_API_KEY ausente" });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, html, text: `${mail.title}\n\n${mail.lead}\n${mail.cta ? `\n${mail.cta.label}: ${mail.cta.url}\n` : ""}\n${product} · tecnologia Z3US.AI` }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) console.error("notify: resend", r.status, JSON.stringify(body).slice(0, 400));
  await admin.from("notifications").update({ status: r.ok ? "sent" : "failed", provider_id: body?.id || null, error: r.ok ? null : JSON.stringify(body), sent_at: r.ok ? new Date().toISOString() : null }).eq("id", row!.id);
  return json({ ok: r.ok, id: body?.id, reason: r.ok ? undefined : (body?.message || `resend ${r.status}`) });
});
