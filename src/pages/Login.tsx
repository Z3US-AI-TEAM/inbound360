import * as React from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { Lock, Mail, KeyRound, ArrowRight } from "lucide-react";
import { supabase, SUPABASE_READY } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { isPersonalEmail, passwordIssues } from "@/lib/utils";
import { Z3Logo } from "@/components/Z3Logo";
import { TenantLogo } from "@/components/TenantLogo";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Seg, Spinner } from "@/components/ui/misc";
import { trackLogin } from "@/lib/engagement";

type Mode = "planta" | "fornecedor";
type Step = "login" | "signup" | "forgot" | "otp" | "sent";

export function LoginPage() {
  const { tenantPublic, session, role, loading, refresh } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = React.useState<Mode>((params.get("perfil") as Mode) || "planta");
  const [step, setStep] = React.useState<Step>("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!loading && session) nav(role === "external" ? "/portal" : "/app/hoje", { replace: true });
  }, [loading, session, role, nav]);

  const tagline = tenantPublic?.identity?.login_tagline || "O fornecedor agenda. A planta vê. A doca recebe na ordem certa.";
  const emailOk = (e: string) => /.+@.+\..+/.test(e) && !isPersonalEmail(e);

  async function withBusy(fn: () => Promise<void>) { setBusy(true); try { await fn(); } catch (e: any) { toast.error(e?.message || "Algo deu errado"); } finally { setBusy(false); } }

  const signIn = () => withBusy(async () => {
    if (!emailOk(email)) throw new Error("Use o e-mail da sua empresa. E-mail pessoal não é aceito.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos" : error.message);
    await refresh();
    const { data } = await supabase.from("tenants").select("id").limit(1).maybeSingle();
    if (data) trackLogin((data as any).id, (await supabase.auth.getUser()).data.user?.id ?? null);
  });

  const signUp = () => withBusy(async () => {
    if (!emailOk(email)) throw new Error("Use o e-mail da sua empresa. E-mail pessoal não é aceito.");
    const issues = passwordIssues(password);
    if (issues.length) throw new Error("A senha precisa de: " + issues.join(", "));
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: location.origin + "/login" } });
    if (error) throw new Error(error.message);
    setStep("sent");
  });

  const forgot = () => withBusy(async () => {
    if (!emailOk(email)) throw new Error("Informe o e-mail da sua empresa.");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/redefinir" });
    if (error) throw new Error(error.message);
    setStep("sent");
  });

  const sendOtp = () => withBusy(async () => {
    if (!emailOk(email)) throw new Error("Use o e-mail cadastrado pela sua empresa.");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw new Error(error.message);
    setStep("otp");
    toast.success("Código enviado. Vale por alguns minutos.");
  });

  const verifyOtp = () => withBusy(async () => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) throw new Error("Código inválido ou expirado");
    await refresh();
  });

  if (loading) return <div className="min-h-screen grid place-items-center"><Spinner /></div>;

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* arte conceitual do login (placeholder até a arte oficial) */}
      <div className="relative hidden lg:block overflow-hidden" style={{ background: "radial-gradient(1200px 600px at 20% 10%, rgba(249,157,40,.16), transparent 60%), radial-gradient(900px 500px at 80% 90%, rgba(59,123,255,.12), transparent 60%), #06080d" }}>
        <LoginArt />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <div className="eyebrow text-[#9aa3b2]">inbound 360 · docas, gate e pátio</div>
          <h2 className="mt-2 text-[28px] leading-tight text-white max-w-[520px]">{tagline}</h2>
          <p className="mt-3 text-[13.5px] text-[#b9bfc9] max-w-[520px]">Uma camada externa por cima do SAP e do WMS. Nada muda nos sistemas globais; o dado entra por extração e o fornecedor entra com identidade própria.</p>
        </div>
      </div>

      <div className="flex flex-col p-6 md:p-10">
        <div className="flex items-center justify-between">
          {tenantPublic?.brand_mode !== "white" ? <Z3Logo className="h-9 w-auto text-ink" /> : <TenantLogo size={40} />}
          {tenantPublic?.brand_mode !== "white" && <TenantLogo size={40} />}
        </div>
        <div className="my-auto max-w-[420px] w-full mx-auto py-10">
          <div className="eyebrow mb-1">{tenantPublic?.name || "Planta"}</div>
          <h1 className="text-[26px]">{tenantPublic?.product_name || "Inbound 360"}</h1>
          <p className="mt-1.5 text-[13.5px] text-ink-2">Entre com o e-mail da sua empresa. E-mail pessoal não é aceito, por governança.</p>

          {!SUPABASE_READY && <div className="mt-4 rounded-sm border border-warn bg-warn-tint px-3 py-2 text-xs font-semibold text-warn">Ambiente sem conexão com o Supabase (variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY).</div>}

          <div className="mt-5"><Seg value={mode} onChange={(m) => { setMode(m); setStep("login"); }} options={[{ value: "planta", label: "Planta" }, { value: "fornecedor", label: "Fornecedor" }]} /></div>

          {mode === "planta" && step === "login" && (
            <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void signIn(); }}>
              <Field label="E-mail corporativo"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@pg.com" required /></Field>
              <Field label="Senha"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              <div className="flex items-center justify-between gap-3">
                <Button type="submit" variant="primary" disabled={busy}>{busy ? <Spinner /> : <Lock />} Entrar</Button>
                <button type="button" className="text-[13px] font-bold text-brand-ink" onClick={() => setStep("forgot")}>Esqueci a senha</button>
              </div>
              <p className="text-[13px] text-muted">Primeiro acesso? <button type="button" className="font-bold text-brand-ink" onClick={() => setStep("signup")}>Criar conta com e-mail corporativo</button></p>
              <SsoNote />
            </form>
          )}

          {mode === "planta" && step === "signup" && (
            <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void signUp(); }}>
              <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
              <Field label="E-mail corporativo" hint="Domínios da sua empresa. E-mail pessoal é recusado pelo servidor."><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <Field label="Senha" hint="Mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo."><Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" disabled={busy}>{busy ? <Spinner /> : <ArrowRight />} Criar conta</Button>
                <button type="button" className="text-[13px] font-bold text-brand-ink" onClick={() => setStep("login")}>Já tenho conta</button>
              </div>
            </form>
          )}

          {step === "forgot" && (
            <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void forgot(); }}>
              <Field label="E-mail corporativo"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" disabled={busy}>{busy ? <Spinner /> : <Mail />} Enviar link de redefinição</Button>
                <button type="button" className="text-[13px] font-bold text-brand-ink" onClick={() => setStep("login")}>Voltar</button>
              </div>
            </form>
          )}

          {mode === "fornecedor" && step === "login" && (
            <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void sendOtp(); }}>
              <Field label="E-mail cadastrado pelo fornecedor" hint="A identidade é do fornecedor, fora dos sistemas da planta, e expira sozinha por inatividade."><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@suaempresa.com.br" required /></Field>
              <Button type="submit" variant="primary" disabled={busy}>{busy ? <Spinner /> : <KeyRound />} Receber código por e-mail</Button>
              <div className="rounded-sm border border-dashed border-line-strong p-3 text-[12.5px] text-ink-2 flex gap-2"><Lock className="size-4 shrink-0 mt-0.5" />Quem sai da empresa perde o acesso sem que ninguém na planta precise apagar nada: a conta expira por inatividade e o gestor do fornecedor pode revogar na hora.</div>
              <p className="text-[13px] text-muted">Tem senha? <button type="button" className="font-bold text-brand-ink" onClick={() => setMode("planta")}>Entrar com senha</button></p>
            </form>
          )}

          {step === "otp" && (
            <form className="mt-5 space-y-4" onSubmit={(e) => { e.preventDefault(); void verifyOtp(); }}>
              <Field label={`Código enviado para ${email}`}><Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" required className="mono tracking-[.2em] text-lg" /></Field>
              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary" disabled={busy}>{busy ? <Spinner /> : <ArrowRight />} Entrar</Button>
                <button type="button" className="text-[13px] font-bold text-brand-ink" onClick={() => setStep("login")}>Trocar e-mail</button>
              </div>
            </form>
          )}

          {step === "sent" && (
            <div className="mt-5 card p-4">
              <div className="font-bold">Confira seu e-mail</div>
              <p className="mt-1 text-[13px] text-ink-2">Enviamos um link para <b>{email}</b>. Se não chegar em alguns minutos, olhe a pasta de spam ou peça de novo.</p>
              <button className="mt-3 text-[13px] font-bold text-brand-ink" onClick={() => setStep("login")}>Voltar ao login</button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-[12px] text-muted">
          <span>{tenantPublic?.name} · {tenantPublic?.product_name} · tecnologia Z3US.AI</span>
          <Link to="/privacidade" className="hover:text-ink">Privacidade</Link>
        </div>
      </div>
    </div>
  );
}

function SsoNote() {
  const enabled = (import.meta.env.VITE_SSO_PROVIDERS as string | undefined)?.split(",").filter(Boolean) || [];
  if (!enabled.length) return null;
  return (
    <div className="pt-2 border-t border-line">
      <div className="text-xs text-muted mb-2">ou entre com a conta corporativa</div>
      <div className="flex gap-2">
        {enabled.includes("azure") && <Button onClick={() => supabase.auth.signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo: location.origin + "/login" } })}>Microsoft</Button>}
        {enabled.includes("google") && <Button onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + "/login" } })}>Google</Button>}
      </div>
    </div>
  );
}

/** Arte conceitual provisória: linhas de docas e fluxo, sem pessoas nem texto. */
function LoginArt() {
  return (
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="g1" x1="0" x2="1"><stop offset="0" stopColor="#f99d28" stopOpacity=".0" /><stop offset=".5" stopColor="#f99d28" stopOpacity=".55" /><stop offset="1" stopColor="#f99d28" stopOpacity="0" /></linearGradient>
      </defs>
      {Array.from({ length: 6 }).map((_, i) => (
        <rect key={i} x={120 + i * 100} y={330} width={64} height={240} rx="6" fill="#0f1218" stroke="#1d2127" />
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <rect key={"b" + i} x={132 + i * 100} y={350 + (i % 3) * 40} width={40} height={140 - (i % 3) * 30} rx="4" fill={i === 2 ? "rgba(249,157,40,.35)" : "rgba(59,123,255,.18)"} />
      ))}
      <path d="M0 580 H800" stroke="#20242a" />
      <path d="M-20 440 C 200 380, 400 520, 820 420" stroke="url(#g1)" strokeWidth="2" fill="none" />
      <path d="M-20 400 C 250 300, 450 480, 820 360" stroke="url(#g1)" strokeWidth="1" fill="none" opacity=".6" />
      {Array.from({ length: 24 }).map((_, i) => (
        <circle key={"c" + i} cx={(i * 137) % 800} cy={80 + ((i * 89) % 320)} r={i % 5 === 0 ? 2.5 : 1.2} fill={i % 7 === 0 ? "#f99d28" : "#3b7bff"} opacity={0.25 + (i % 4) * 0.15} />
      ))}
    </svg>
  );
}
