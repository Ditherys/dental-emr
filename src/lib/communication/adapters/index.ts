import "server-only";

import { createTestCommunicationAdapter } from "./test-adapter";
import type { CommunicationAdapter } from "./types";

export function resolveCommunicationAdapter(): CommunicationAdapter {
  const name = process.env.COMMUNICATION_ADAPTER ?? "test";
  switch (name) {
    case "test":
      return createTestCommunicationAdapter();
    default:
      throw new Error(`Unknown COMMUNICATION_ADAPTER "${name}". Only the "test" adapter is implemented.`);
  }
}