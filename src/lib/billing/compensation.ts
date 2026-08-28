import { BillingContractError } from "./errors";
import { assertMoneyCentavos } from "./money";
import {
  MAX_RATE_BPS,
  type ChargeBalanceInput,
  type CumulativeEarningTargetInput,
} from "./types";

function assertRateBps(rateBps: number) {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_RATE_BPS) {
    throw new BillingContractError("Compensation rate must be an integer from 0 to 10000 basis points.");
  }
}

export function calculateChargeBalance(input: ChargeBalanceInput): bigint {
  const charge = assertMoneyCentavos(input.chargeCentavos, "Charge amount");
  const allocated = assertMoneyCentavos(input.allocatedCentavos, "Allocated amount");

  if (allocated > charge) {
    throw new BillingContractError("Allocated amount cannot exceed the charge amount.");
  }

  return charge - allocated;
}

export function calculateCumulativeEarningTarget(
  input: CumulativeEarningTargetInput,
): bigint {
  if (input.basis !== "GROSS" && input.basis !== "NET_DIRECT_COST") {
    throw new BillingContractError("Compensation basis is invalid.");
  }
  const allocated = assertMoneyCentavos(input.allocatedCentavos, "Allocated amount");
  const directCost = assertMoneyCentavos(input.approvedDirectCostCentavos, "Approved direct cost");
  assertRateBps(input.rateBps);

  const eligibleBasis = input.basis === "GROSS"
    ? allocated
    : allocated > directCost
      ? allocated - directCost
      : BigInt(0);

  return (eligibleBasis * BigInt(input.rateBps) + BigInt(5000)) / BigInt(10000);
}

export function calculateEarningDelta(
  targetCentavos: bigint,
  postedEntries: readonly bigint[],
): bigint {
  const target = assertMoneyCentavos(targetCentavos, "Earning target");
  const posted = postedEntries.reduce((sum, entry) => {
    if (typeof entry !== "bigint") {
      throw new BillingContractError("Posted earning entries must be bigint centavos.");
    }

    return sum + entry;
  }, BigInt(0));

  return target - posted;
}
