"use client";

import {
    type FormEvent,
    useState,
} from "react";

import {
    askDocument,
    type DocumentAnswer,
} from "../../lib/document-ask.api";

export function DocumentAsk() {
    const [question, setQuestion] =
        useState("");

    const [result, setResult] =
        useState<DocumentAnswer | null>(
            null,
        );

    const [isAsking, setIsAsking] =
        useState(false);

    const [error, setError] =
        useState<string | null>(
            null,
        );

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        const normalizedQuestion =
            question.trim();

        if (!normalizedQuestion) {
            return;
        }

        try {
            setIsAsking(true);

            setError(null);

            setResult(null);

            /*
             * IMPORTANT
             *
             * We intentionally DO NOT send
             * documentId here.
             *
             * Therefore the backend searches
             * ALL READY documents belonging
             * to this user.
             */
            const response =
                await askDocument({
                    question:
                        normalizedQuestion,
                });

            setResult(response);
        } catch (caughtError) {
            setError(
                caughtError instanceof Error
                    ? caughtError.message
                    : "Could not answer the question.",
            );
        } finally {
            setIsAsking(false);
        }
    }

    return (
        <section
            style={{
                width: "100%",
                maxWidth: "760px",
                padding: "32px",
                border:
                    "1px solid #d4d4d8",
                borderRadius: "16px",
                background: "#ffffff",
                boxSizing: "border-box",
            }}
        >
            <header
                style={{
                    marginBottom: "24px",
                }}
            >
                <h1
                    style={{
                        margin: 0,
                        fontSize: "28px",
                    }}
                >
                    Ask FindAnything
                </h1>

                <p
                    style={{
                        marginTop: "8px",
                        marginBottom: 0,
                        color: "#52525b",
                        lineHeight: 1.5,
                    }}
                >
                    Ask questions across all
                    your processed documents.
                </p>
            </header>

            <form
                onSubmit={
                    handleSubmit
                }
            >
                <textarea
                    value={question}
                    onChange={(event) =>
                        setQuestion(
                            event.target.value,
                        )
                    }
                    placeholder="Ask anything from your documents..."
                    rows={5}
                    style={{
                        width: "100%",
                        padding: "14px",
                        border:
                            "1px solid #a1a1aa",
                        borderRadius: "10px",
                        resize: "vertical",
                        boxSizing:
                            "border-box",
                        fontFamily: "inherit",
                        fontSize: "16px",
                    }}
                />

                <button
                    type="submit"
                    disabled={
                        isAsking ||
                        !question.trim()
                    }
                    style={{
                        width: "100%",
                        marginTop: "12px",
                        padding:
                            "12px 16px",
                        border: 0,
                        borderRadius: "8px",
                        background:
                            isAsking ||
                                !question.trim()
                                ? "#a1a1aa"
                                : "#18181b",
                        color: "#ffffff",
                        fontWeight: 700,
                        cursor:
                            isAsking ||
                                !question.trim()
                                ? "not-allowed"
                                : "pointer",
                    }}
                >
                    {isAsking
                        ? "Searching..."
                        : "Ask"}
                </button>
            </form>

            {error && (
                <div
                    role="alert"
                    style={{
                        marginTop: "20px",
                        padding: "12px",
                        background:
                            "#fef2f2",
                        color: "#991b1b",
                        borderRadius: "8px",
                    }}
                >
                    {error}
                </div>
            )}

            {result && (
                <section
                    style={{
                        marginTop: "28px",
                    }}
                >
                    <h2>
                        Answer
                    </h2>

                    <div
                        style={{
                            whiteSpace:
                                "pre-wrap",
                            lineHeight: 1.7,
                        }}
                    >
                        {result.answer}
                    </div>

                    {result.sources.length >
                        0 && (
                            <div
                                style={{
                                    marginTop:
                                        "24px",
                                }}
                            >
                                <h3>
                                    Sources
                                </h3>

                                <ul>
                                    {result.sources.map(
                                        (
                                            source,
                                        ) => (
                                            <li
                                                key={
                                                    source.chunkId
                                                }
                                                style={{
                                                    marginBottom:
                                                        "10px",
                                                }}
                                            >
                                                <strong>
                                                    {
                                                        source.documentName
                                                    }
                                                </strong>

                                                {source.pageNumber !==
                                                    null &&
                                                    ` — Page ${source.pageNumber}`}
                                            </li>
                                        ),
                                    )}
                                </ul>
                            </div>
                        )}
                </section>
            )}
        </section>
    );
}