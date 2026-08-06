import { open } from "node:fs/promises";

const PDF_SIGNATURE = "%PDF-";

export async function validatePdfFile(filePath: string): Promise<void> {
  const fileHandle = await open(filePath, "r");

  try {
    const signatureBuffer = Buffer.alloc(PDF_SIGNATURE.length);

    const result = await fileHandle.read(
      signatureBuffer,
      0,
      PDF_SIGNATURE.length,
      0,
    );

    if (result.bytesRead !== PDF_SIGNATURE.length) {
      throw new Error("The downloaded file is too small to be a valid PDF.");
    }

    const signature = signatureBuffer.toString("ascii");

    if (signature !== PDF_SIGNATURE) {
      throw new Error(`Invalid PDF signature: ${JSON.stringify(signature)}`);
    }
  } finally {
    await fileHandle.close();
  }
}
