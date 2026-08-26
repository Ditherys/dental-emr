import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveCommunicationAdapter } from "./adapters";
import {
  createTestCommunicationAdapter,
  getTestCommunicationRegistry,
  resetTestCommunicationRegistry,
} from "./adapters/test-adapter";

const originalAdapterEnv = process.env.COMMUNICATION_ADAPTER;

describe("test communication adapter", () => {
  beforeEach(() => resetTestCommunicationRegistry());
  afterEach(() => {
    resetTestCommunicationRegistry();
    if (originalAdapterEnv === undefined) delete process.env.COMMUNICATION_ADAPTER;
    else process.env.COMMUNICATION_ADAPTER = originalAdapterEnv;
  });

  it("returns a fixed providerMessageId format", async () => {
    const adapter = createTestCommunicationAdapter();
    const sms = await adapter.sendSms({ recipient: "+639181234567", body: "body", idempotencyKey: "job-1" });
    const email = await adapter.sendEmail({ recipient: "juan@example.com", body: "body", idempotencyKey: "job-2" });
    expect(sms.providerMessageId).toBe("test-sms-job-1");
    expect(email.providerMessageId).toBe("test-email-job-2");
  });

  it("returns the same providerMessageId for the same idempotencyKey (idempotency)", async () => {
    const adapter = createTestCommunicationAdapter();
    const first = await adapter.sendSms({ recipient: "+639181234567", body: "body", idempotencyKey: "job-1" });
    const second = await adapter.sendSms({ recipient: "+639181234567", body: "body", idempotencyKey: "job-1" });
    expect(first.providerMessageId).toBe(second.providerMessageId);
    expect(getTestCommunicationRegistry().size).toBe(1);
  });

  it("records distinct sends for distinct idempotencyKeys", async () => {
    const adapter = createTestCommunicationAdapter();
    const first = await adapter.sendSms({ recipient: "+639181234567", body: "body", idempotencyKey: "job-1" });
    const second = await adapter.sendSms({ recipient: "+639181234567", body: "body", idempotencyKey: "job-2" });
    expect(first.providerMessageId).not.toBe(second.providerMessageId);
    expect(getTestCommunicationRegistry().size).toBe(2);
  });

  it("does not contact any network (deterministic, synchronous path)", async () => {
    const adapter = createTestCommunicationAdapter();
    const result = await adapter.sendSms({ recipient: "+639181234567", body: "body", idempotencyKey: "job-1" });
    expect(result).toEqual({ providerMessageId: "test-sms-job-1" });
  });
});

describe("resolveCommunicationAdapter", () => {
  beforeEach(() => resetTestCommunicationRegistry());
  afterEach(() => {
    resetTestCommunicationRegistry();
    if (originalAdapterEnv === undefined) delete process.env.COMMUNICATION_ADAPTER;
    else process.env.COMMUNICATION_ADAPTER = originalAdapterEnv;
  });

  it("defaults to the test adapter when the env var is unset", async () => {
    delete process.env.COMMUNICATION_ADAPTER;
    const adapter = resolveCommunicationAdapter();
    const result = await adapter.sendSms({ recipient: "+639181234567", body: "body", idempotencyKey: "job-1" });
    expect(result.providerMessageId).toBe("test-sms-job-1");
  });

  it("selects the test adapter for COMMUNICATION_ADAPTER=test", async () => {
    process.env.COMMUNICATION_ADAPTER = "test";
    const adapter = resolveCommunicationAdapter();
    const result = await adapter.sendEmail({ recipient: "juan@example.com", body: "body", idempotencyKey: "job-1" });
    expect(result.providerMessageId).toBe("test-email-job-1");
  });

  it("throws for an unknown adapter value (no vendor hard-coded)", () => {
    process.env.COMMUNICATION_ADAPTER = "twilio";
    expect(() => resolveCommunicationAdapter()).toThrow(/Unknown COMMUNICATION_ADAPTER/);
  });
});