import { supabase } from "./supabase";

const ROLE_LABEL: Record<string, string> = { tenant_admin: "Admin do tenant", operator: "Operador", viewer: "Leitura", external: "Externo (fornecedor)" };

export interface NotifyResult { ok: boolean; skipped?: boolean; reason?: string; id?: string }

/** Envia uma notificação transacional pela Edge Function `notify` (Resend). Nunca lança: devolve o resultado para a tela decidir o aviso. */
export async function notify(tenantId: string, to: string, template: string, payload: Record<string, unknown>): Promise<NotifyResult> {
  try {
    const { data, error } = await supabase.functions.invoke("notify", { body: { tenant_id: tenantId, to, template, payload } });
    if (error) return { ok: false, reason: error.message };
    const r = (data || {}) as NotifyResult;
    return { ok: !!r.ok, skipped: r.skipped, reason: r.reason, id: r.id };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** E-mail de convite: quem recebe cria a conta com o mesmo e-mail e entra sozinho no tenant. */
export function sendInvite(tenant: { id: string; slug: string; name: string; product_name?: string | null }, email: string, role: string) {
  return notify(tenant.id, email, "convite", {
    product: tenant.product_name || "Inbound 360",
    tenant: tenant.name,
    role: ROLE_LABEL[role] || role,
    url: `${location.origin}/t/${tenant.slug}`,
  });
}

/** Texto curto para o toast depois do convite registrado. */
export function inviteOutcome(r: NotifyResult) {
  if (r.ok) return "E-mail de convite enviado.";
  if (r.skipped) return "Convite registrado; e-mail não saiu (RESEND_API_KEY ausente). Mande o link de login à pessoa.";
  return `Convite registrado; e-mail não saiu (${r.reason || "falha no envio"}). Mande o link de login à pessoa.`;
}
