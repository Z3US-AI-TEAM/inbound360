// Notificações transacionais pelo Resend, com registro em public.notifications
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const FROM = Deno.env.get("NOTIFY_FROM") || "Inbound 360 <inbound360@hermes.z3us.ai>";

const TEMPLATES: Record<string, (p: any) => { subject: string; html: string }> = {
  convite: (p) => ({ subject: `Convite: ${p.product} · ${p.tenant}`, html: `<p>Você foi convidado para o <b>${p.product}</b> de ${p.tenant} com o perfil <b>${p.role}</b>.</p><p>Crie sua conta com este e-mail em <a href="${p.url}">${p.url}</a>. E-mail pessoal não é aceito.</p>` }),
  janela_confirmada: (p) => ({ subject: `Janela confirmada · ${p.dia} ${p.hora} · ${p.doca}`, html: `<p>${p.fornecedor}, sua entrega da PO <b>${p.po}</b> está confirmada para <b>${p.dia} às ${p.hora}</b>, ${p.doca}.</p><p>O link de check-in do motorista sai 3 horas antes.</p>` }),
  janela_movida: (p) => ({ subject: `Janela alterada · ${p.dia} ${p.hora} · ${p.doca}`, html: `<p>A janela da PO <b>${p.po}</b> foi movida para <b>${p.dia} às ${p.hora}</b>, ${p.doca}.</p>` }),
  no_show: (p) => ({ subject: `No-show registrado · PO ${p.po}`, html: `<p>Não houve chegada 30 minutos após a janela de ${p.hora}. Reagende pelo portal.</p>` }),
  inadimplencia: (p) => ({ subject: `Pendência financeira · ${p.tenant}`, html: `<p>Há uma fatura em aberto há ${p.dias} dias. O acesso será bloqueado em ${p.bloqueio_em} dias. Fale com financeiro@z3us.ai.</p>` }),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") || "";
  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: "não autenticado" }, 401);
  const { tenant_id, to, template, payload } = await req.json();
  const { data: role } = await anon.rpc("my_role", { t: tenant_id });
  if (!role || role === "viewer") return json({ error: "sem permissão" }, 403);
  const t = TEMPLATES[template]; if (!t) return json({ error: "template desconhecido" }, 400);
  const { subject, html } = t(payload || {});
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const key = Deno.env.get("RESEND_API_KEY");
  const { data: row } = await admin.from("notifications").insert({ tenant_id, to_email: to, template, subject, payload, status: key ? "queued" : "skipped", error: key ? null : "RESEND_API_KEY ausente" }).select("id").single();
  if (!key) return json({ ok: false, skipped: true, reason: "RESEND_API_KEY ausente" });
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: FROM, to: [to], subject, html: `${html}<p style="color:#8e9096;font-size:12px">Inbound 360 · tecnologia Z3US.AI</p>` }) });
  const body = await r.json().catch(() => ({}));
  await admin.from("notifications").update({ status: r.ok ? "sent" : "failed", provider_id: body?.id || null, error: r.ok ? null : JSON.stringify(body), sent_at: r.ok ? new Date().toISOString() : null }).eq("id", row!.id);
  return json({ ok: r.ok, id: body?.id });
});
