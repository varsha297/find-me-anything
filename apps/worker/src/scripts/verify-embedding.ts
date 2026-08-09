import { OpenAIEmbeddingProvider } from "../embeddings/openai-embedding-provider.js";

import { openaiClient } from "../embeddings/openai-client.js";

async function main(): Promise<void> {
  const provider = new OpenAIEmbeddingProvider(openaiClient);

  const text = "Node.js uses an event loop to handle asynchronous operations.";

  console.log("Generating embedding...");

  const results = await provider.embedTexts([text]);

  const result = results[0];

  if (!result) {
    throw new Error("Embedding was not returned.");
  }

  console.log("Embedding generated successfully.");

  console.log({
    text,

    dimensions: result.embedding.length,

    first10Values: result.embedding.slice(0, 10),
  });
}

main().catch((error: unknown) => {
  console.error("Embedding verification failed.", error);

  process.exitCode = 1;
});
