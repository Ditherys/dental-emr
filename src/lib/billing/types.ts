export const PHP_CURRENCY_CODE = "PHP" as const;
export const MAX_MONEY_CENTAVOS = BigInt("99999999999");
export const MAX_RATE_BPS = 10_000;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const PAYMENT_REFERENCE_MAX_LENGTH = 80;
export const ADJUSTMENT_REASON_MAX_LENGTH = 500;

export type CompensationBasis = "GROSS" | "NET_DIRECT_COST";

export type PaymentMethodRow = {
  method_id: string;
  code: string;
  name: string;
  active: boolean;
};

export type ProcedureDirectCostDefaultRow = {
  direct_cost_default_id: string;
  cost_type: "LAB" | "MATERIAL" | "OTHER";
  description: string;
  amount_centavos: number;
  active: boolean;
  version: number;
};

export type ProcedurePaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export type ProcedurePaymentSummary = {
  procedureId: string;
  patientId: string;
  branchId: string;
  chargedCentavos: number;
  adjustedCentavos: number;
  paidCentavos: number;
  pendingPdcCentavos: number;
  remainingCentavos: number;
  paymentStatus: ProcedurePaymentStatus;
};

export type ProcedureConfigurationMutationResult = {
  id: string;
  version: number;
};

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
  branchId: string;
  paymentId: string;
  chargeId: string;
  patientId: string;
  amountCentavos: bigint;
  idempotencyKey: string;
};

export type PaymentAllocationReversalInput = {
  branchId: string;
  allocationId: string;
  amountCentavos: bigint;
  reason: string;
  idempotencyKey: string;
};

export type PaymentRefundInput = {
  branchId: string;
  paymentId: string;
  patientId: string;
  amountCentavos: bigint;
  reason: string;
  idempotencyKey: string;
};

export type FinancialSummaryRow = {
  period: string;
  metricCode: string;
  metricLabel: string;
  branchId: string | null;
  providerId: string | null;
  procedureId: string | null;
  paymentMethodCode: string | null;
  productionCentavos: number;
  collectionCentavos: number;
  pendingPdcCentavos: number;
  clinicContributionCentavos: number;
  unresolvedCompensationCentavos: number;
};

export type PendingPdcRow = {
  chequeId: string;
  patientId: string;
  branchId: string;
  amountCentavos: number;
  dateDue: string;
  status: string;
  bankName: string;
  chequeNumber: string;
  daysUntilDue: number;
};
