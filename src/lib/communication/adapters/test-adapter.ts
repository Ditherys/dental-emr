import "server-only";

import type { CommunicationAdapter, CommunicationSendInput, CommunicationSendResult } from "./types";

type TestChannel = "SMS" | "EMAIL";

export type TestRecordedSend = {
  channel: TestChannel;
  recipient: string;
  body: string;
  providerMessageId: string;
};

const registry = new Map<string, TestRecordedSend>();

export function createTestCommunicationAdapter(): CommunicationAdapter {
  return {
    async sendSms(input: CommunicationSendInput) {
      return record("SMS", input);
    },
    async sendEmail(input: CommunicationSendInput) {
      return record("EMAIL", input);
    },
  };
}

function record(channel: TestChannel, input: CommunicationSendInput): CommunicationSendResult {
  const existing = registry.get(input.idempotencyKey);
  if (existing) return { providerMessageId: existing.providerMessageId };

  const providerMessageId = `test-${channel.toLowerCase()}-${input.idempotencyKey}`;
  registry.set(input.idempotencyKey, {
    channel,
    recipient: input.recipient,
    body: input.body,
    providerMessageId,
  });
  return { providerMessageId };
}

export function resetTestCommunicationRegistry() {
  registry.clear();
}

export function getTestCommunicationRegistry(): ReadonlyMap<string, TestRecordedSend> {
  return registry;
}