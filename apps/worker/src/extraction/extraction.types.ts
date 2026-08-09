export type ExtractedSourceLocation =
  | {
      kind: "page";
      pageNumber: number;
    }
  | {
      kind: "section";
      label: string;
    };

export type ExtractedSection = {
  sectionIndex: number;
  text: string;
  characterCount: number;
  location: ExtractedSourceLocation;
};

export type ExtractedDocument = {
  sections: ExtractedSection[];

  metadata: {
    title?: string;
    author?: string;
  };

  totalCharacterCount: number;
};

export type ExtractDocumentInput = {
  filePath: string;
  mimeType: string;
  originalName: string;
};
