export type ExtractionQualityResult = {
  isAcceptable: boolean;
  totalCharacters: number;
  suspiciousCharacters: number;
  suspiciousRatio: number;
  reason?: string;
};

const SUSPICIOUS_CHARACTER_PATTERN =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g;

export function validateExtractionQuality(
  text: string,
): ExtractionQualityResult {
  const trimmedText = text.trim();

  if (trimmedText.length === 0) {
    return {
      isAcceptable: false,
      totalCharacters: 0,
      suspiciousCharacters: 0,
      suspiciousRatio: 0,
      reason: "No text could be extracted from the document.",
    };
  }

  const suspiciousCharacters =
    trimmedText.match(SUSPICIOUS_CHARACTER_PATTERN) ?? [];

  const suspiciousRatio = suspiciousCharacters.length / trimmedText.length;

  /*
   * Start conservatively.
   *
   * 0.1% suspicious control characters
   * is enough for us to consider extraction
   * questionable.
   */
  const MAX_SUSPICIOUS_RATIO = 0.001;

  if (suspiciousRatio > MAX_SUSPICIOUS_RATIO) {
    return {
      isAcceptable: false,
      totalCharacters: trimmedText.length,
      suspiciousCharacters: suspiciousCharacters.length,
      suspiciousRatio,
      reason:
        "Extracted text contains too many suspicious or invalid characters.",
    };
  }

  return {
    isAcceptable: true,
    totalCharacters: trimmedText.length,
    suspiciousCharacters: suspiciousCharacters.length,
    suspiciousRatio,
  };
}
