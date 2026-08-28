export class BillingContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingContractError";
  }
}
