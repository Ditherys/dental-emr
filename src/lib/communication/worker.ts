import "server-only";

import { resolveCommunicationAdapter } from "./adapters";
import type { CommunicationAdapter, CommunicationSendInput } from "./adapters/types";
import { acknowledgeCommunication, claimDueCommunications, failCommunication } from "./service";
import type { ClaimedCommunication } from "./types";

export type CommunicationWorkerSummary = {
  claimed: number;
  sent: number;
  failed: number;
};

export type ProcessDueCommunicationsOptions = {
  limit?: number;
  adapter?: CommunicationAdapter;
};

function sendInputFor(job: ClaimedCommunication): CommunicationSendInput {
  return {
    recipient: job.recipient,
    body: job.body,
    idempotencyKey: job.communicationId,
  };
}

export async function processDueCommunications(
  actingBranchId: string,
  opts: ProcessDueCommunicationsOptions = {},
): Promise<CommunicationWorkerSummary> {
  const claimed = await claimDueCommunications({ actingBranchId, limit: opts.limit ?? 10 });
  let sent = 0;
  let failed = 0;

  for (const job of claimed) {
    const adapter = opts.adapter ?? resolveCommunicationAdapter();
    try {
      const input = sendInputFor(job);
      const result = job.channel === "SMS"
        ? await adapter.sendSms(input)
        : await adapter.sendEmail(input);
      await acknowledgeCommunication({
        actingBranchId,
        communicationId: job.communicationId,
        providerMessageId: result.providerMessageId,
      });
      sent += 1;
    } catch {
      try {
        await failCommunication({ actingBranchId, communicationId: job.communicationId });
      } catch {
        // A concurrent worker may have already transitioned the job; it is
        // not this pass's responsibility. Count it as failed either way.
      }
      failed += 1;
    }
  }

  return { claimed: claimed.length, sent, failed };
}