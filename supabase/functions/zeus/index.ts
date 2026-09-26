// Zeus · resposta com fonte e hora, a partir do contexto enviado pelo cliente (dados do tenant que o usuário já enxerga pela RLS)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") || "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "não autenticado" }, 401);

  const { question, context, tenant_id, history } = await req.json();
  if (!question || !tenant_id) return json({ error: "pergunta e tenant obrigatórios" }, 400);
  const { data: role } = await supabase.rpc("my_role", { t: tenant_id });
  if (!role) return json({ error: "sem acesso ao tenant" }, 403);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY não configurada" }, 503);
  const model = Deno.env.get("ZEUS_MODEL") || "claude-sonnet-4-5";
  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const system = `Você é o Zeus, assistente do inbound de uma planta industrial (recebimento: docas, portaria, pátio).
Responda em português do Brasil, curto e direto, só com o que está no CONTEXTO. Nunca invente número, fornecedor, PO ou horário.
Se não houver dado para responder, diga isso em uma frase. Termine SEMPRE com uma linha "Fonte: <tabelas usadas> · ${now}".
Regras que você cita quando sugere: prioridade v1 pesa free time do contêiner, cobertura de estoque e prazo da PO; corte às 16h; janelas por fornecedor por dia.
Não prometa integração com órgão público, robô de portão nem certificação. Perfil de quem pergunta: ${role}.`;

  const messages = [...(Array.isArray(history) ? history.slice(-6).map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) })) : []),
    { role: "user", content: `CONTEXTO (JSON):\n${JSON.stringify(context).slice(0, 60000)}\n\nPERGUNTA: ${question}` }];

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 700, system, messages }),
  });
  if (!r.ok) return json({ error: "modelo indisponível", detail: await r.text() }, 502);
  const out = await r.json();
  const answer = (out.content || []).map((c: any) => c.text || "").join("\n").trim();
  await supabase.from("ib_zeus_messages").insert([
    { tenant_id, user_id: user.id, role: "user", content: question },
    { tenant_id, user_id: user.id, role: "assistant", content: answer, model, sources: [{ name: "contexto do dia", at: now }] },
  ]);
  return json({ answer, model, sources: [{ name: "dados do tenant (RLS)", at: now.split(" ")[1]?.slice(0, 5) || now }] });
});
