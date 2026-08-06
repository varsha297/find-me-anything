import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";

export type DownloadS3ObjectInput = {
  bucketName: string;
  objectKey: string;
  originalName: string;
  expectedSizeBytes: number;
};

export type DownloadedS3Object = {
  filePath: string;
  sizeBytes: number;

  cleanup(): Promise<void>;
};

export class DownloadS3ObjectService {
  constructor(private readonly s3Client: S3Client) {}

  async execute(input: DownloadS3ObjectInput): Promise<DownloadedS3Object> {
    const tempDirectory = await mkdtemp(join(tmpdir(), "findanything-"));

    /*
     * basename prevents values such as "../../secret.txt"
     * from escaping the temporary directory.
     */
    const safeFileName = basename(input.originalName) || "uploaded-document";

    const filePath = join(tempDirectory, safeFileName);

    try {
      const response = await this.s3Client.send(
        new GetObjectCommand({
          Bucket: input.bucketName,
          Key: input.objectKey,
        }),
      );

      if (!response.Body) {
        throw new Error("S3 GetObject returned an empty response body.");
      }

      /*
       * In the Node.js AWS SDK runtime, GetObject Body
       * is returned as a readable stream.
       */
      if (!(response.Body instanceof Readable)) {
        throw new Error("S3 GetObject body is not a Node.js readable stream.");
      }

      if (
        response.ContentLength !== undefined &&
        response.ContentLength !== input.expectedSizeBytes
      ) {
        throw new Error(
          [
            "S3 ContentLength does not match the expected file size.",
            `Expected: ${input.expectedSizeBytes}`,
            `Received: ${response.ContentLength}`,
          ].join(" "),
        );
      }

      /*
       * Stream the PDF to disk rather than loading the
       * complete file into Node.js memory.
       */
      await pipeline(
        response.Body,
        createWriteStream(filePath, {
          flags: "wx",
        }),
      );

      const fileStats = await stat(filePath);

      if (fileStats.size !== input.expectedSizeBytes) {
        throw new Error(
          [
            "Downloaded file size does not match the expected size.",
            `Expected: ${input.expectedSizeBytes}`,
            `Downloaded: ${fileStats.size}`,
          ].join(" "),
        );
      }

      return {
        filePath,
        sizeBytes: fileStats.size,

        cleanup: async (): Promise<void> => {
          await rm(tempDirectory, {
            recursive: true,
            force: true,
          });
        },
      };
    } catch (error) {
      await rm(tempDirectory, {
        recursive: true,
        force: true,
      });

      throw error;
    }
  }
}
