export const PHP_CURRENCY_CODE = "PHP" as const;
export const MAX_MONEY_CENTAVOS = BigInt("99999999999");
export const MAX_RATE_BPS = 10_000;

export type CompensationBasis = "GROSS" | "NET_DIRECT_COST";

export type ChargeBalanceInput = {
  chargeCentavos: bigint;
  allocatedCentavos: bigint;
};

export type CumulativeEarningTargetInput = {
  basis: CompensationBasis;
  allocatedCentavos: bigint;
  approvedDirectCostCentavos: bigint;
  rateBps: number;
};
