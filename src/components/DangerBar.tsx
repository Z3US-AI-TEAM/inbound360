import { AlertTriangle } from "lucide-react";
import { useSession } from "@/lib/session";

export function DangerBar() {
  const { access, tenant } = useSession();
  if (access.mode === "bar") {
    return (
      <div className="danger-bar flex items-center justify-center gap-2">
        <AlertTriangle className="size-4" />
        <span>Pendência financeira há {access.days} dias. O acesso será bloqueado em {Math.max(0, (access.block_days || 15) - (access.days || 0))} dias. Fale com o financeiro da Z3US.AI.</span>
      </div>
    );
  }
  if (access.mode === "warn") {
    return (
      <div className="w-full text-center text-[12.5px] font-bold py-1.5" style={{ background: "var(--warn-tint)", color: "var(--warn)" }}>
        Fatura de {tenant?.name} em aberto há {access.days} dias.
      </div>
    );
  }
  return null;
}

export function BlockedScreen() {
  const { tenant, access, signOut } = useSession();
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <div className="card max-w-[520px] p-6">
        <div className="eyebrow mb-2">Acesso suspenso</div>
        <h1 className="text-[22px]">{tenant?.name}</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">
          {access.reason === "closed" ? "Este ambiente foi encerrado." : `O acesso foi bloqueado por pendência financeira${access.days ? ` há ${access.days} dias` : ""}. Nenhum dado foi apagado. Assim que a pendência for regularizada, o acesso volta na hora.`}
        </p>
        <p className="mt-3 text-[13px] text-muted">Financeiro Z3US.AI: financeiro@z3us.ai</p>
        <button className="mt-5 text-brand-ink font-bold text-[13px]" onClick={() => signOut()}>Sair</button>
      </div>
    </div>
  );
}
