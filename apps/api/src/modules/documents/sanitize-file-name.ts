import path from "node:path";

const MAX_BASE_NAME_LENGTH = 120;
const MAX_EXTENSION_LENGTH = 10;

export function sanitizeFileName(originalFileName: string): string {
  const extension = path
    .extname(originalFileName)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, "")
    .slice(0, MAX_EXTENSION_LENGTH);

  const originalBaseName = path.basename(
    originalFileName,
    path.extname(originalFileName),
  );

  const sanitizedBaseName = originalBaseName
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, MAX_BASE_NAME_LENGTH);

  const safeBaseName =
    sanitizedBaseName.length > 0 ? sanitizedBaseName : "document";

  return `${safeBaseName}${extension}`;
}
