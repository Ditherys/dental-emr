import { BillingContractError } from "./errors";
import { MAX_MONEY_CENTAVOS } from "./types";

export { MAX_MONEY_CENTAVOS } from "./types";

function assertCentavos(value: bigint, label: string) {
  if (value < BigInt(0)) {
    throw new BillingContractError(`${label} must be nonnegative centavos.`);
  }

  if (value > MAX_MONEY_CENTAVOS) {
    throw new BillingContractError(`${label} exceeds the maximum centavo amount.`);
  }
}

export function parseMoneyCentavos(value: string): bigint {
  if (typeof value !== "string") {
    throw new BillingContractError("Money input must be a base-10 digit string.");
  }

  if (!/^[0-9]+$/.test(value)) {
    throw new BillingContractError("Money input must be a base-10 centavo digit string.");
  }

  const centavos = BigInt(value);
  assertCentavos(centavos, "Money input");
  return centavos;
}

export function assertMoneyCentavos(value: bigint, label = "Money value") {
  if (typeof value !== "bigint") {
    throw new BillingContractError(`${label} must be bigint centavos.`);
  }

  assertCentavos(value, label);
  return value;
}

export function formatPhpCentavos(value: bigint): string {
  const centavos = assertMoneyCentavos(value);
  const pesos = centavos / BigInt(100);
  const remainder = (centavos % BigInt(100)).toString().padStart(2, "0");
  const formattedPesos = pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `PHP ${formattedPesos}.${remainder}`;
}
