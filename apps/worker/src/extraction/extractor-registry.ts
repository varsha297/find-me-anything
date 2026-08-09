import { DocumentExtractorRegistry } from "./document-extractor-registry.js";
import { PdfDocumentExtractor } from "./pdf-document-extractor.js";
import { PlainTextDocumentExtractor } from "./plain-text-document-extractor.js";

export const documentExtractorRegistry = new DocumentExtractorRegistry([
  new PdfDocumentExtractor(),
  new PlainTextDocumentExtractor(),
]);
