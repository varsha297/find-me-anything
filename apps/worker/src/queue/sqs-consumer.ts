import {
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type Message,
  type SQSClient,
} from "@aws-sdk/client-sqs";

import type { ParsedS3ObjectCreatedRecord } from "../events/parse-s3-event.js";
import { parseS3Event } from "../events/parse-s3-event.js";

export type DocumentEventProcessor = {
  process(record: ParsedS3ObjectCreatedRecord): Promise<void>;
};

type SqsConsumerDependencies = {
  sqsClient: SQSClient;
  queueUrl: string;
  processor: DocumentEventProcessor;
};

export class SqsConsumer {
  constructor(private readonly dependencies: SqsConsumerDependencies) {}

  async start(signal: AbortSignal): Promise<void> {
    console.log("SQS worker started.");

    while (!signal.aborted) {
      try {
        const response = await this.dependencies.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: this.dependencies.queueUrl,

            MaxNumberOfMessages: 1,

            /*
             * Wait up to 20 seconds for a message instead
             * of constantly sending empty requests.
             */
            WaitTimeSeconds: 20,

            MessageSystemAttributeNames: ["ApproximateReceiveCount"],
          }),
          {
            abortSignal: signal,
          },
        );

        const messages = response.Messages ?? [];

        for (const message of messages) {
          await this.handleMessage(message);
        }
      } catch (error) {
        if (signal.aborted) {
          break;
        }

        console.error("Failed while polling SQS:", error);

        /*
         * Prevent a tight error loop during temporary
         * AWS/network failures.
         */
        await this.delay(2_000, signal);
      }
    }

    console.log("SQS worker stopped.");
  }

  private async handleMessage(message: Message): Promise<void> {
    const messageId = message.MessageId ?? "unknown";

    const receiveCount =
      message.Attributes?.ApproximateReceiveCount ?? "unknown";

    console.log("Received SQS message.", {
      messageId,
      receiveCount,
    });

    try {
      const body = this.parseMessageBody(message);
      const event = parseS3Event(body);

      if (event.type === "test-event") {
        console.log("Received S3 test event. Deleting it.", {
          messageId,
        });

        await this.deleteMessage(message);
        return;
      }

      /*
       * One S3 notification message can contain more
       * than one object-created record.
       *
       * All records must succeed before the SQS message
       * is deleted.
       */
      for (const record of event.records) {
        await this.dependencies.processor.process(record);
      }

      await this.deleteMessage(message);

      console.log("SQS message processed successfully.", {
        messageId,
      });
    } catch (error) {
      /*
       * Deliberately do not delete the message.
       *
       * After the visibility timeout, SQS will make it
       * available for another attempt. Repeated failures
       * eventually move it to the DLQ.
       */
      console.error("SQS message processing failed.", {
        messageId,
        receiveCount,
        error,
      });
    }
  }

  private parseMessageBody(message: Message): unknown {
    if (!message.Body) {
      throw new Error("SQS message does not contain a body.");
    }

    try {
      return JSON.parse(message.Body) as unknown;
    } catch {
      throw new Error("SQS message body is not valid JSON.");
    }
  }

  private async deleteMessage(message: Message): Promise<void> {
    if (!message.ReceiptHandle) {
      throw new Error("SQS message does not have a receipt handle.");
    }

    await this.dependencies.sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: this.dependencies.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
      }),
    );
  }

  private async delay(
    milliseconds: number,
    signal: AbortSignal,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const timeout = setTimeout(resolve, milliseconds);

      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        {
          once: true,
        },
      );
    });
  }
}
