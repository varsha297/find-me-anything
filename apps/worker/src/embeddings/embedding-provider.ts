export type EmbeddingResult = {
  embedding: number[];
};

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  embedTexts(texts: string[]): Promise<EmbeddingResult[]>;
}
