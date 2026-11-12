import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import type { DocumentDef, FieldDef, ServiceDetail, ServiceSummary } from "@/features/demande/types";

interface ServiceRow {
  id: string; code: string; icon: string; name: Record<string, string>; description: Record<string, string>;
  procedure: Record<string, string>; indicative_delay_days: number | null;
}
const COLS = "id, code, icon, name, description, procedure, indicative_delay_days";

type PriceRow = { service_id: string; amount_xof: number; valid_from: string; valid_to: string | null };
function currentAmount(rows: PriceRow[], serviceId: string, today = new Date().toISOString().slice(0, 10)): number | null {
  const r = rows
    .filter((p) => p.service_id === serviceId && p.valid_from <= today && (!p.valid_to || p.valid_to >= today))
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0];
  return r ? r.amount_xof : null; // aucun tarif par défaut : null = « à confirmer »
}

export async function listServices(municipalityId: string): Promise<ServiceSummary[]> {
  const sb = await createServerSupabase();
  const { data: services } = await sb.from("services").select(COLS).eq("municipality_id", municipalityId).eq("is_active", true).order("sort_order");
  const { data: prices } = await sb.from("service_pricing").select("service_id, amount_xof, valid_from, valid_to").eq("municipality_id", municipalityId);
  return ((services ?? []) as ServiceRow[]).map((s) => ({
    code: s.code, icon: s.icon, name: s.name, description: s.description,
    indicative_delay_days: s.indicative_delay_days, amount_xof: currentAmount((prices ?? []) as PriceRow[], s.id),
  }));
}

async function detailOf(row: ServiceRow, municipalityId: string): Promise<ServiceDetail> {
  const sb = await createServerSupabase();
  const [{ data: fields }, { data: docs }, { data: prices }] = await Promise.all([
    sb.from("service_fields").select("key,label,help,type,required,options,validation,visible_if,step,sort_order").eq("service_id", row.id).order("sort_order"),
    sb.from("service_documents").select("key,label,required,max_size_kb,sort_order").eq("service_id", row.id).order("sort_order"),
    sb.from("service_pricing").select("service_id, amount_xof, valid_from, valid_to").eq("service_id", row.id).eq("municipality_id", municipalityId),
  ]);
  return {
    code: row.code, icon: row.icon, name: row.name, description: row.description, procedure: row.procedure,
    indicative_delay_days: row.indicative_delay_days, amount_xof: currentAmount((prices ?? []) as PriceRow[], row.id),
    fields: (fields ?? []) as FieldDef[], documents: (docs ?? []) as DocumentDef[],
  };
}

export async function getServiceByCode(municipalityId: string, code: string): Promise<ServiceDetail | null> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("services").select(COLS).eq("municipality_id", municipalityId).eq("code", code).eq("is_active", true).maybeSingle();
  return data ? detailOf(data as ServiceRow, municipalityId) : null;
}
export async function getServiceById(municipalityId: string, id: string): Promise<ServiceDetail | null> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("services").select(COLS).eq("municipality_id", municipalityId).eq("id", id).eq("is_active", true).maybeSingle();
  return data ? detailOf(data as ServiceRow, municipalityId) : null;
}
export const __test = { currentAmount };
