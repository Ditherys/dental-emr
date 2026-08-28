export const PHP_CURRENCY_CODE = "PHP" as const;
export const MAX_MONEY_CENTAVOS = BigInt("99999999999");
export const MAX_RATE_BPS = 10_000;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const PAYMENT_REFERENCE_MAX_LENGTH = 80;
export const ADJUSTMENT_REASON_MAX_LENGTH = 500;

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

export type PaymentRecordInput = {
  patientId: string;
  branchId: string;
  paymentMethodId: string;
  amountCentavos: bigint;
  reference?: string;
  idempotencyKey: string;
};

export type PaymentAllocationInput = {
  paymentId: string;
  chargeId: string;
  patientId: string;
  amountCentavos: bigint;
  idempotencyKey: string;
};

export type PaymentAllocationReversalInput = {
  allocationId: string;
  amountCentavos: bigint;
  cause: "MANUAL" | "REFUND" | "VOID";
  reason: string;
  idempotencyKey: string;
};

export type PaymentRefundInput = {
  paymentId: string;
  patientId: string;
  amountCentavos: bigint;
  reason: string;
  idempotencyKey: string;
};