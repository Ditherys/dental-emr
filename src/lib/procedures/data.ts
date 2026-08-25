import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";
import { createClient } from "@/lib/supabase/server";

import { mapProcedureRpcError } from "./errors";
import { bookingModeSchema, procedureDetailReadSchema, procedureReadSchema, procedureStatusSchema, specialtyRequirementLevelSchema } from "./schema";
import type { ProcedureDetail, ProcedureListItem } from "./types";

const procedureListItemSchema = z.object({
  procedure_id: databaseUuid, code: z.string(), name: z.string(), status: procedureStatusSchema,
  default_duration_minutes: z.number().int().positive().nullable(), pre_buffer_minutes: z.number().int().nonnegative(),
  post_buffer_minutes: z.number().int().nonnegative(), website_visible: z.boolean(), online_booking_enabled: z.boolean(),
  booking_mode: bookingModeSchema, specialty_count: z.coerce.number().int().nonnegative(), eligible_provider_count: z.coerce.number().int().nonnegative(),
});
const procedureDetailSchema = z.object({
  procedureId: databaseUuid, code: z.string(), name: z.string(), description: z.string().nullable(),
  defaultDurationMinutes: z.number().int().positive().nullable(), preBufferMinutes: z.number().int().nonnegative(),
  postBufferMinutes: z.number().int().nonnegative(), status: procedureStatusSchema, websiteVisible: z.boolean(),
  onlineBookingEnabled: z.boolean(), bookingMode: bookingModeSchema, version: z.number().int().positive(),
  specialties: z.array(z.object({ specialtyId: databaseUuid, requirementLevel: specialtyRequirementLevelSchema }).strict()),
  eligibleProviderIds: z.array(databaseUuid),
}).strict();
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() }).strict();
type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export async function listProcedures(input: unknown): Promise<ProcedureListItem[]> {
  const value = procedureReadSchema.parse(input);
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)("list_procedures", { p_acting_branch_id: value.actingBranchId }));
  if (response.error) throw mapProcedureRpcError(response.error);
  return z.array(procedureListItemSchema).parse(response.data).map((row) => ({
    procedureId: row.procedure_id, code: row.code, name: row.name, status: row.status,
    defaultDurationMinutes: row.default_duration_minutes, preBufferMinutes: row.pre_buffer_minutes,
    postBufferMinutes: row.post_buffer_minutes, websiteVisible: row.website_visible,
    onlineBookingEnabled: row.online_booking_enabled, bookingMode: row.booking_mode,
    specialtyCount: row.specialty_count, eligibleProviderCount: row.eligible_provider_count,
  }));
}

export async function getProcedure(procedureId: unknown, actingBranchId: unknown): Promise<ProcedureDetail> {
  const value = procedureDetailReadSchema.parse({ procedureId, actingBranchId });
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)("get_procedure_configuration", { p_acting_branch_id: value.actingBranchId, p_procedure_id: value.procedureId }));
  if (response.error) throw mapProcedureRpcError(response.error);
  return procedureDetailSchema.parse(response.data);
}
