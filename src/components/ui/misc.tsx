import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-[13px] font-semibold cursor-pointer">
      <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}
        className="relative h-5 w-9 rounded-full bg-surface-3 border border-line-strong data-[state=checked]:bg-brand data-[state=checked]:border-brand transition-colors disabled:opacity-50">
        <SwitchPrimitive.Thumb className="block h-4 w-4 rounded-full bg-white shadow translate-x-0.5 data-[state=checked]:translate-x-[18px] transition-transform" />
      </SwitchPrimitive.Root>
      {label && <span>{label}</span>}
    </label>
  );
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...p }: TabsPrimitive.TabsListProps) {
  return <TabsPrimitive.List className={cn("inline-flex flex-wrap gap-1 rounded-full bg-surface-2 border border-line p-1", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: TabsPrimitive.TabsTriggerProps) {
  return <TabsPrimitive.Trigger className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-2 data-[state=active]:bg-surface-3 data-[state=active]:text-ink", className)} {...p} />;
}
export const TabsContent = TabsPrimitive.Content;

export function Tip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-[280px] rounded-sm bg-surface-3 border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-ink shadow-card">
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function Seg<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode }[]; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-full bg-surface-2 border border-line p-0.5", className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold", value === o.value ? "bg-surface-3 text-ink" : "text-ink-2 hover:text-ink")}>{o.label}</button>
      ))}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-line-strong border-t-brand", className)} aria-label="carregando" />;
}

export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow?: string; title: string; lead?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="min-w-0 max-w-[720px]">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="text-[22px] leading-tight">{title}</h1>
        {lead && <p className="mt-1 text-[13.5px] text-ink-2">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
