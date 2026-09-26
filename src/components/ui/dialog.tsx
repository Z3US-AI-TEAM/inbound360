import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, title, description, side = "center", ...props }: Omit<DialogPrimitive.DialogContentProps, "title"> & { title: React.ReactNode; description?: React.ReactNode; side?: "center" | "right" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 bg-surface border border-line shadow-lg focus:outline-none",
          side === "center" && "left-1/2 top-1/2 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded p-5 data-[state=open]:animate-in data-[state=open]:zoom-in-95",
          side === "right" && "right-0 top-0 h-full w-[min(100vw,460px)] overflow-y-auto p-5 data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <DialogPrimitive.Title className="text-[17px] font-bold leading-tight">{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="text-[13px] text-muted mt-0.5">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded-sm p-1 text-ink-2 hover:bg-surface-3" aria-label="Fechar"><X className="size-4" /></DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
