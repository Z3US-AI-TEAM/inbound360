import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card", className)} {...props} />;
}
export function CardHeader({ className, title, eyebrow, actions, children }: { className?: string; title?: React.ReactNode; eyebrow?: string; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 px-4 pt-4 pb-2", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
        {title && <h2 className="text-[17px] leading-tight">{title}</h2>}
        {children}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

export function Kpi({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "ok" | "warn" | "crit" | "brand" | "info" }) {
  return (
    <div className="card px-4 py-3.5 min-w-0">
      <div className="text-[12.5px] font-semibold text-muted">{label}</div>
      <div className="kpi-value mt-1.5">{value}</div>
      {sub && <div className={cn("mt-1.5 text-xs font-semibold", tone === "ok" && "text-ok", tone === "warn" && "text-warn", tone === "crit" && "text-crit", tone === "brand" && "text-brand-ink", tone === "info" && "text-info-ink", !tone && "text-muted")}>{sub}</div>}
    </div>
  );
}

export function Chip({ kind = "default", children, className }: { kind?: "default" | "ok" | "warn" | "crit" | "info" | "brand"; children: React.ReactNode; className?: string }) {
  return <span className={cn("chip", kind !== "default" && `chip-${kind}`, className)}>{children}</span>;
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line-strong px-6 py-10 text-center">
      <div className="font-bold">{title}</div>
      {hint && <div className="mt-1 text-[13px] text-muted">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
