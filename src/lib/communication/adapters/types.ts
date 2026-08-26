export type CommunicationSendInput = {
  recipient: string;
  body: string;
  idempotencyKey: string;
};

export type CommunicationSendResult = {
  providerMessageId: string;
};

export interface CommunicationAdapter {
  sendSms(input: CommunicationSendInput): Promise<CommunicationSendResult>;
  sendEmail(input: CommunicationSendInput): Promise<CommunicationSendResult>;
}