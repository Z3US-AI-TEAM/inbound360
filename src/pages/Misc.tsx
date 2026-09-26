import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { passwordIssues } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Z3Logo } from "@/components/Z3Logo";

export function ResetPage() {
  const nav = useNavigate();
  const [p1, setP1] = React.useState(""); const [p2, setP2] = React.useState(""); const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const issues = passwordIssues(p1);
    if (issues.length) return toast.error("A senha precisa de: " + issues.join(", "));
    if (p1 !== p2) return toast.error("As senhas não conferem");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Senha redefinida"); nav("/app/hoje");
  }
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="card w-full max-w-[420px] p-6 space-y-4">
        <Z3Logo className="h-8 w-auto text-ink" />
        <h1 className="text-[20px]">Nova senha</h1>
        <Field label="Senha" hint="Mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo."><Input type="password" value={p1} onChange={(e) => setP1(e.target.value)} required /></Field>
        <Field label="Repita a senha"><Input type="password" value={p2} onChange={(e) => setP2(e.target.value)} required /></Field>
        <Button type="submit" variant="primary" disabled={busy}>Salvar</Button>
      </form>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="min-h-screen p-6 md:p-10 max-w-[760px] mx-auto">
      <Z3Logo className="h-8 w-auto text-ink" />
      <h1 className="mt-6 text-[24px]">Privacidade e dados</h1>
      <div className="mt-4 space-y-3 text-[14px] text-ink-2">
        <p>Este ambiente trata o mínimo necessário para agendar e receber uma entrega: número da PO, material, quantidade, janela, placa do veículo e contato do motorista. Dados pessoais de motoristas e de usuários são tratados com base legal definida e retenção limitada, nos termos da LGPD (Lei nº 13.709/2018).</p>
        <p>Identidades de fornecedores são próprias, fora dos sistemas do cliente, expiram por inatividade e podem ser revogadas a qualquer momento pelo gestor do fornecedor ou pela planta.</p>
        <p>Em ambiente de demonstração, todos os fornecedores, POs, placas e números são fictícios.</p>
        <p>Contato: privacidade@z3us.ai</p>
      </div>
      <Link to="/login" className="inline-block mt-6 text-brand-ink font-bold">Voltar</Link>
    </div>
  );
}

export function NotFound() {
  return <div className="min-h-screen grid place-items-center p-6"><div className="text-center"><div className="eyebrow">404</div><h1 className="text-[22px] mt-1">Essa página não existe</h1><Link className="inline-block mt-4 text-brand-ink font-bold" to="/app/hoje">Ir para o início</Link></div></div>;
}

export function NoAccess() {
  const { profile, signOut, tenantPublic } = useSession();
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card max-w-[520px] p-6">
        <Z3Logo className="h-8 w-auto text-ink" />
        <h1 className="mt-4 text-[22px]">Conta criada, acesso pendente</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">Sua conta <b>{profile?.email}</b> ainda não está vinculada a <b>{tenantPublic?.name}</b>. Peça ao administrador da planta um convite para este e-mail, ou aguarde a liberação.</p>
        <button className="mt-5 text-brand-ink font-bold text-[13px]" onClick={() => signOut()}>Sair</button>
      </div>
    </div>
  );
}
