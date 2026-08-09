export function normalizeExtractedText(value: string): string {
  return (
    value
      /*
       * Normalize Windows and old Mac line endings.
       */
      .replace(/\r\n?/g, "\n")

      /*
       * Remove spaces immediately before newlines.
       */
      .replace(/[ \t]+\n/g, "\n")

      /*
       * Collapse repeated horizontal whitespace.
       */
      .replace(/[ \t]{2,}/g, " ")

      /*
       * Avoid huge groups of blank lines.
       */
      .replace(/\n{3,}/g, "\n\n")

      .trim()
  );
}
