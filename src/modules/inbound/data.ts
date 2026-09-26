import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { bizDay, ymd } from "@/lib/utils";
import { trackAction } from "@/lib/engagement";

export type ApptStatus = "requested" | "scheduled" | "confirmed" | "en_route" | "at_gate" | "in_yard" | "at_dock" | "completed" | "no_show" | "cancelled";
export const STATUS_LABEL: Record<ApptStatus, string> = {
  requested: "Solicitado", scheduled: "Agendado", confirmed: "Confirmado", en_route: "A caminho", at_gate: "Na portaria", in_yard: "No pátio", at_dock: "Na doca", completed: "Concluído", no_show: "No-show", cancelled: "Cancelado",
};
export const STATUS_ORDER: ApptStatus[] = ["requested", "scheduled", "confirmed", "en_route", "at_gate", "in_yard", "at_dock", "completed"];

export interface Appt {
  id: string; tenant_id: string; plant_id: string; code: string; dock_id: string | null; po_id: string | null; supplier_id: string; load_type_id: string;
  starts_at: string; ends_at: string; status: ApptStatus; vehicle_plate: string | null; driver_name: string | null; driver_phone: string | null;
  container_no: string | null; nfe_key: string | null; eta_at: string | null; arrived_at: string | null; yard_spot: string | null;
  priority_score: number | null; priority_reason: string | null; source: string; created_at: string;
  dock_code: string | null; dock_name: string | null; dock_kind: string | null;
  supplier_code: string; supplier_name: string; supplier_short: string | null; is_broker: boolean; punctuality: number | null;
  load_type_code: string; load_type_name: string; duration_min: number; vehicle: string;
  po_number: string | null; material: string | null; quantity: string | null; origin: string | null; coverage_days: number | null; free_time_until: string | null; due_date: string | null;
}
export interface Dock { id: string; code: string; name: string; kind: string; active: boolean; sort: number; plant_id: string }
export interface LoadType { id: string; code: string; name: string; duration_min: number; vehicle: string; handling: string; supplier_can_book: boolean }
export interface Supplier { id: string; code: string; name: string; short_name: string | null; city: string | null; distance_note: string | null; is_broker: boolean; contact_name: string | null; contact_phone: string | null; max_windows_per_day: number; min_lead_hours: number; cutoff_time: string; punctuality: number | null; active: boolean; email_domains: string[] }
export interface PO { id: string; po_number: string; supplier_id: string; material: string; quantity: string | null; due_date: string | null; origin: string; coverage_days: number | null; free_time_until: string | null; container_no: string | null; eta: string | null; vessel_delay_days: number; released_at: string | null; status: string; supplier_code: string; supplier_name: string; supplier_short: string | null; is_broker: boolean; appointments: number }
export interface Release { id: string; broker_id: string; po_id: string | null; container_no: string; free_time_days: number | null; received_at: string; appointment_id: string | null; status: string; suggested_at: string | null; suggestion_reason: string | null }
export interface Plant { id: string; code: string; name: string; open_time: string; close_time: string; slot_minutes: number; no_show_minutes: number; timezone: string }
export interface ApptEvent { id: string; appointment_id: string; at: string; kind: string; note: string | null }

export function useTenantId() { const { tenant } = useSession(); return tenant?.id ?? null; }

export function dayRange(dayIndex: number) {
  const d = bizDay(dayIndex); const start = new Date(d); start.setHours(0, 0, 0, 0); const end = new Date(d); end.setHours(23, 59, 59, 999);
  return { start, end, ymd: ymd(d) };
}

export function usePlant() {
  const t = useTenantId();
  return useQuery({ queryKey: ["plant", t], enabled: !!t, queryFn: async () => { const { data, error } = await supabase.from("ib_plants").select("*").eq("tenant_id", t!).order("code").limit(1).maybeSingle(); if (error) throw error; return data as Plant | null; } });
}
export function useDocks() {
  const t = useTenantId();
  return useQuery({ queryKey: ["docks", t], enabled: !!t, queryFn: async () => { const { data, error } = await supabase.from("ib_docks").select("*").eq("tenant_id", t!).order("sort"); if (error) throw error; return data as Dock[]; } });
}
export function useLoadTypes() {
  const t = useTenantId();
  return useQuery({ queryKey: ["load_types", t], enabled: !!t, queryFn: async () => { const { data, error } = await supabase.from("ib_load_types").select("*").eq("tenant_id", t!).order("code"); if (error) throw error; return data as LoadType[]; } });
}
export function useSuppliers() {
  const t = useTenantId();
  return useQuery({ queryKey: ["suppliers", t], enabled: !!t, queryFn: async () => { const { data, error } = await supabase.from("ib_suppliers").select("*").eq("tenant_id", t!).order("name"); if (error) throw error; return data as Supplier[]; } });
}
export function usePOs(supplierId?: string) {
  const t = useTenantId();
  return useQuery({ queryKey: ["pos", t, supplierId], enabled: !!t, queryFn: async () => {
    let q = supabase.from("ib_purchase_orders_v").select("*").eq("tenant_id", t!).order("due_date");
    if (supplierId) q = q.eq("supplier_id", supplierId);
    const { data, error } = await q; if (error) throw error; return data as PO[];
  } });
}
export function useAppointments(dayIndex: number | null) {
  const t = useTenantId();
  return useQuery({ queryKey: ["appts", t, dayIndex], enabled: !!t, refetchInterval: 30_000, queryFn: async () => {
    let q = supabase.from("ib_appointments_v").select("*").eq("tenant_id", t!).order("starts_at");
    if (dayIndex != null) { const r = dayRange(dayIndex); q = q.gte("starts_at", r.start.toISOString()).lte("starts_at", r.end.toISOString()); }
    const { data, error } = await q; if (error) throw error; return data as Appt[];
  } });
}
export function useAllAppointments() { return useAppointments(null); }
export function useEvents(apptId: string | null) {
  return useQuery({ queryKey: ["events", apptId], enabled: !!apptId, queryFn: async () => { const { data, error } = await supabase.from("ib_appointment_events").select("*").eq("appointment_id", apptId!).order("at"); if (error) throw error; return data as ApptEvent[]; } });
}
export function useReleases() {
  const t = useTenantId();
  return useQuery({ queryKey: ["releases", t], enabled: !!t, queryFn: async () => { const { data, error } = await supabase.from("ib_releases").select("*").eq("tenant_id", t!).order("received_at"); if (error) throw error; return data as Release[]; } });
}
export function useYard() {
  const t = useTenantId();
  return useQuery({ queryKey: ["yard", t], enabled: !!t, refetchInterval: 30_000, queryFn: async () => { const { data, error } = await supabase.from("ib_yard_spots").select("*").eq("tenant_id", t!).order("code"); if (error) throw error; return data as { id: string; code: string; zone: string; appointment_id: string | null; occupied_since: string | null }[]; } });
}
export function useHorizon() {
  const t = useTenantId();
  return useQuery({ queryKey: ["horizon", t], enabled: !!t, queryFn: async () => { const { data, error } = await supabase.from("ib_horizon").select("*, po:ib_purchase_orders(po_number, material, origin, vessel_delay_days, supplier:ib_suppliers(short_name, code))").eq("tenant_id", t!).order("starts_on"); if (error) throw error; return data as any[]; } });
}
export function useCapacity() {
  const t = useTenantId();
  return useQuery({ queryKey: ["capacity", t], enabled: !!t, queryFn: async () => { const { data, error } = await supabase.from("ib_capacity").select("*").eq("tenant_id", t!).order("day"); if (error) throw error; return data as { day: string; capacity_pallets: number; demand_pallets: number }[]; } });
}
export function useRules() {
  const t = useTenantId();
  return useQuery({ queryKey: ["rules", t], enabled: !!t, queryFn: async () => { const { data, error } = await supabase.from("ib_rules").select("*").eq("tenant_id", t!).order("key"); if (error) throw error; return data as { id: string; key: string; value: any; description: string | null }[]; } });
}

/** Mutations com trilha de eventos */
export function useApptMutations() {
  const qc = useQueryClient();
  const { tenant, user } = useSession();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["appts"] }); qc.invalidateQueries({ queryKey: ["events"] }); qc.invalidateQueries({ queryKey: ["yard"] }); qc.invalidateQueries({ queryKey: ["releases"] }); qc.invalidateQueries({ queryKey: ["pos"] }); };
  const addEvent = async (appointment_id: string, kind: string, note: string, meta: Record<string, unknown> = {}) => {
    await supabase.from("ib_appointment_events").insert({ tenant_id: tenant!.id, appointment_id, kind, note, actor_id: user?.id ?? null, meta });
  };
  const setStatus = useMutation({
    mutationFn: async ({ id, status, note, extra }: { id: string; status: ApptStatus; note?: string; extra?: Partial<Appt> }) => {
      const patch: Record<string, unknown> = { status, ...(extra || {}) };
      if (status === "at_gate" && !extra?.arrived_at) patch.arrived_at = new Date().toISOString();
      const { error } = await supabase.from("ib_appointments").update(patch).eq("id", id); if (error) throw error;
      const kind = status === "at_gate" ? "gate" : status === "in_yard" ? "yard" : status === "at_dock" ? "dock_in" : status === "completed" ? "completed" : status === "no_show" ? "no_show" : status === "cancelled" ? "cancelled" : status === "confirmed" || status === "scheduled" ? "validated" : "note";
      await addEvent(id, kind, note || STATUS_LABEL[status]);
      trackAction(tenant!.id, user?.id ?? null, "appt.status", { status });
    }, onSuccess: invalidate,
  });
  const move = useMutation({
    mutationFn: async ({ id, dock_id, starts_at, ends_at, note }: { id: string; dock_id: string; starts_at: string; ends_at: string; note?: string }) => {
      const { error } = await supabase.from("ib_appointments").update({ dock_id, starts_at, ends_at, status: "confirmed" }).eq("id", id); if (error) throw error;
      await addEvent(id, "rescheduled", note || "Janela movida pela analista; fornecedor e motorista avisados");
      trackAction(tenant!.id, user?.id ?? null, "appt.move");
    }, onSuccess: invalidate,
  });
  const create = useMutation({
    mutationFn: async (row: { plant_id: string; dock_id: string | null; po_id: string | null; supplier_id: string; load_type_id: string; starts_at: string; ends_at: string; status: ApptStatus; source: string; vehicle_plate?: string | null; driver_name?: string | null; driver_phone?: string | null; nfe_key?: string | null; container_no?: string | null; note?: string }) => {
      const day = new Date(row.starts_at);
      const code = "LOU-" + ymd(day).replace(/-/g, "") + "-" + String(Math.floor(Math.random() * 9000) + 1000);
      const { data: pr } = row.po_id ? await supabase.rpc("ib_priority", { p_po: row.po_id }) : { data: null };
      const p = Array.isArray(pr) ? pr[0] : pr;
      const { note, ...rest } = row;
      const { data, error } = await supabase.from("ib_appointments").insert({ tenant_id: tenant!.id, code, created_by: user?.id ?? null, priority_score: p?.score ?? null, priority_reason: p?.reason ?? null, ...rest }).select("id").single();
      if (error) throw new Error(error.message.includes("Doca ocupada") ? "Essa doca já tem agendamento nesse horário" : error.message);
      await addEvent(data.id, "booked", note || "Agendado pelo portal; PO validada na extração do SAP");
      await addEvent(data.id, "notified", "Confirmação enviada por e-mail e WhatsApp; link de check-in gerado para o motorista");
      trackAction(tenant!.id, user?.id ?? null, "appt.create", { source: row.source });
      return data.id as string;
    }, onSuccess: invalidate,
  });
  const gateEvent = useMutation({
    mutationFn: async (row: { plant_id: string; appointment_id: string | null; plate: string; kind: string; note?: string; checklist?: Record<string, unknown> }) => {
      const { error } = await supabase.from("ib_gate_events").insert({ tenant_id: tenant!.id, actor_id: user?.id ?? null, ...row }); if (error) throw error;
    }, onSuccess: () => qc.invalidateQueries({ queryKey: ["gate"] }),
  });
  const releaseAction = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Release> }) => { const { error } = await supabase.from("ib_releases").update(patch).eq("id", id); if (error) throw error; },
    onSuccess: invalidate,
  });
  const yardAssign = useMutation({
    mutationFn: async ({ spotId, appointment_id }: { spotId: string; appointment_id: string | null }) => {
      const { error } = await supabase.from("ib_yard_spots").update({ appointment_id, occupied_since: appointment_id ? new Date().toISOString() : null }).eq("id", spotId); if (error) throw error;
    }, onSuccess: invalidate,
  });
  return { setStatus, move, create, gateEvent, releaseAction, yardAssign, addEvent, invalidate };
}
