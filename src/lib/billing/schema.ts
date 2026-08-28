import { z } from "zod";

import { MAX_MONEY_CENTAVOS, MAX_RATE_BPS } from "./types";

export const moneyCentavoStringSchema = z
  .string()
  .refine(
    (value) => /^[0-9]+$/.test(value) && BigInt(value) <= MAX_MONEY_CENTAVOS,
    "Amount must be a bounded base-10 centavo digit string.",
  );

export const compensationRateBpsSchema = z.number().int().min(0).max(MAX_RATE_BPS);
export const compensationBasisSchema = z.enum(["GROSS", "NET_DIRECT_COST"]);
