import { sqsClient } from "./aws/sqs-client.js";
import { env } from "./config/env.js";
import { DocumentEventProcessorImpl } from "./processors/document-event.processor.js";
import { SqsConsumer } from "./queue/sqs-consumer.js";

async function main(): Promise<void> {
  if (!env.WORKER_ENABLED) {
    console.log("Worker is configured correctly but disabled.");

    console.log(
      "Keep WORKER_ENABLED=false until the document processing pipeline is implemented.",
    );

    return;
  }

  const abortController = new AbortController();

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}. Shutting down worker.`);

    abortController.abort();
  };

  process.once("SIGINT", () => {
    shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    shutdown("SIGTERM");
  });

  const processor = new DocumentEventProcessorImpl();

  const consumer = new SqsConsumer({
    sqsClient,
    queueUrl: env.SQS_QUEUE_URL,
    processor,
  });

  await consumer.start(abortController.signal);
}

main().catch((error: unknown) => {
  console.error("Worker failed to start:", error);

  process.exitCode = 1;
});
