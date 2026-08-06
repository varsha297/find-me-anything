import { readFile } from "node:fs/promises";

import { parseS3Event } from "../events/parse-s3-event.js";

async function main(): Promise<void> {
  const fixtureUrl = new URL("../fixtures/upload-event.json", import.meta.url);

  const rawEvent = await readFile(fixtureUrl, "utf8");
  const payload: unknown = JSON.parse(rawEvent);

  const parsedEvent = parseS3Event(payload);

  console.dir(parsedEvent, {
    depth: null,
  });
}

main().catch((error: unknown) => {
  console.error("Failed to parse S3 event:", error);
  process.exitCode = 1;
});
