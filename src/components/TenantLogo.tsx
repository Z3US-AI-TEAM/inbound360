import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";

/** Logo do cliente: só a partir do arquivo oficial (tenant.logo_url). Sem arquivo, chip com o nome curto. */
export function TenantLogo({ className, size = 36 }: { className?: string; size?: number }) {
  const { tenantPublic } = useSession();
  const name = tenantPublic?.name || "";
  const short = name.split("·")[0].trim() || "Cliente";
  if (tenantPublic?.logo_url) {
    return <img src={tenantPublic.logo_url} alt={short} className={cn("block object-contain", className)} style={{ height: size }} />;
  }
  return (
    <span className={cn("inline-flex items-center justify-center rounded-sm bg-white text-[#003da5] font-bold px-2.5 border border-line", className)} style={{ height: size, minWidth: size * 1.7, fontSize: Math.round(size * 0.42) }} aria-label={short}>
      {short}
    </span>
  );
}
