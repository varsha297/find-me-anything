import type OpenAI from "openai";

import type { SearchResult } from "../search/search.types.js";

const ANSWER_MODEL = "gpt-5.6-luna";

export class RagAnswerService {
  constructor(private readonly client: OpenAI) {}

  async generateAnswer(input: {
    question: string;
    chunks: SearchResult[];
  }): Promise<string> {
    if (input.chunks.length === 0) {
      return "I couldn't find relevant information " + "in your documents.";
    }

    const context = input.chunks
      .map((chunk, index) => {
        const sourceNumber = index + 1;

        const page =
          chunk.pageNumber !== null
            ? `Page ${chunk.pageNumber}`
            : "Page unavailable";

        return [
          `[SOURCE ${sourceNumber}]`,
          `Document: ${chunk.documentName}`,
          page,
          `Content:`,
          chunk.content,
        ].join("\n");
      })
      .join("\n\n");

    const response = await this.client.responses.create({
      model: ANSWER_MODEL,

      reasoning: {
        effort: "low",
      },

      instructions: [
        "You are the document-answering assistant for FindAnything.",
        "",
        "Answer using only the supplied document context.",
        "Do not use outside knowledge.",
        "",
        "If the context does not contain enough information to answer,",
        'say: "I could not find enough information in the provided documents."',
        "",
        "When making a factual claim, cite the relevant source using",
        "[SOURCE 1], [SOURCE 2], etc.",
        "",
        "Do not invent source numbers.",
        "Do not invent document names or page numbers.",
        "",
        "Give a clear and concise answer.",
      ].join("\n"),

      input: [
        `Question:`,
        input.question,
        "",
        "Document context:",
        context,
      ].join("\n"),
    });

    const answer = response.output_text.trim();

    if (!answer) {
      throw new Error("LLM returned an empty answer.");
    }

    return answer;
  }
}
