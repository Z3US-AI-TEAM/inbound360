import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const pad = (n: number) => String(n).padStart(2, "0");
export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function fmtHM(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d) : d;
  return pad(x.getHours()) + ":" + pad(x.getMinutes());
}
export function fmtDia(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return DIAS[x.getDay()] + " " + pad(x.getDate()) + "/" + pad(x.getMonth() + 1);
}
export function fmtLong(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return DIAS[x.getDay()] + " " + x.getDate() + " " + MESES[x.getMonth()];
}
export function fmtDMY(d: Date | string | null | undefined) {
  if (!d) return "";
  const x = typeof d === "string" ? new Date(d.length === 10 ? d + "T12:00:00" : d) : d;
  return pad(x.getDate()) + "/" + pad(x.getMonth() + 1) + "/" + x.getFullYear();
}
export function minutesOfDay(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.getHours() * 60 + x.getMinutes();
}
export const nfmt = new Intl.NumberFormat("pt-BR");
export const num = (v: number) => nfmt.format(v);
export function relTime(d: Date | string) {
  const x = typeof d === "string" ? new Date(d) : d;
  const diff = Math.round((Date.now() - x.getTime()) / 60000);
  if (Math.abs(diff) < 1) return "agora";
  if (diff > 0) return diff < 60 ? `há ${diff} min` : diff < 1440 ? `há ${Math.round(diff / 60)} h` : `há ${Math.round(diff / 1440)} d`;
  const a = -diff;
  return a < 60 ? `em ${a} min` : a < 1440 ? `em ${Math.round(a / 60)} h` : `em ${Math.round(a / 1440)} d`;
}
export function isBizDay(d: Date) { const w = d.getDay(); return w !== 0 && w !== 6; }
/** Dia útil relativo: 0 = hoje (ou a última sexta no fim de semana). Igual ao app.biz_day do banco. */
export function bizDay(n: number, from = new Date()) {
  const d = new Date(from); d.setHours(12, 0, 0, 0);
  while (!isBizDay(d)) d.setDate(d.getDate() - 1);
  const step = n >= 0 ? 1 : -1; let left = Math.abs(n);
  while (left > 0) { d.setDate(d.getDate() + step); if (isBizDay(d)) left--; }
  return d;
}
export function ymd(d: Date) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
export function dayName(n: number) { return n === 0 ? "hoje" : n === 1 ? "amanhã" : fmtDia(bizDay(n)); }
export const PERSONAL_DOMAINS = ["gmail.com","googlemail.com","hotmail.com","hotmail.com.br","outlook.com","outlook.com.br","live.com","yahoo.com","yahoo.com.br","icloud.com","me.com","uol.com.br","bol.com.br","terra.com.br","ig.com.br","protonmail.com","proton.me","aol.com","msn.com","globo.com","zipmail.com.br"];
export function isPersonalEmail(e: string) { return PERSONAL_DOMAINS.includes(e.toLowerCase().split("@")[1] || ""); }
export function passwordIssues(p: string) {
  const issues: string[] = [];
  if (p.length < 12) issues.push("mínimo de 12 caracteres");
  if (!/[A-Z]/.test(p)) issues.push("uma letra maiúscula");
  if (!/[a-z]/.test(p)) issues.push("uma letra minúscula");
  if (!/[0-9]/.test(p)) issues.push("um número");
  if (!/[^A-Za-z0-9]/.test(p)) issues.push("um símbolo");
  return issues;
}
