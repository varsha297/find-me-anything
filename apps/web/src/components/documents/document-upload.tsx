"use client";

import {
    type ChangeEvent,
    type FormEvent,
    useRef,
    useState,
} from "react";

import {
    createDocumentUploadSession,
    createMultipleDocumentUploadSessions,
    getDocumentMimeType,
    MAX_BATCH_UPLOAD_SIZE_BYTES,
    MAX_FILES_PER_BATCH,
    MAX_UPLOAD_SIZE_BYTES,
    uploadFileDirectlyToS3,
} from "../../lib/document-upload";

type UploadMode = "single" | "multiple";

type FileUploadStatus =
    | "selected"
    | "preparing"
    | "uploading"
    | "success"
    | "failed";

interface SelectedFileItem {
    id: string;
    file: File;
    status: FileUploadStatus;
    documentId?: string;
    error?: string;
}

function formatFileSize(
    sizeBytes: number,
): string {
    if (sizeBytes < 1024) {
        return `${sizeBytes} bytes`;
    }

    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KB`;
    }

    return `${(
        sizeBytes /
        (1024 * 1024)
    ).toFixed(1)} MB`;
}

function getStatusLabel(
    status: FileUploadStatus,
): string {
    switch (status) {
        case "selected":
            return "Ready to upload";

        case "preparing":
            return "Creating upload session";

        case "uploading":
            return "Uploading directly to S3";

        case "success":
            return "Uploaded successfully";

        case "failed":
            return "Upload failed";
    }
}

function getStatusColor(
    status: FileUploadStatus,
): string {
    switch (status) {
        case "success":
            return "#166534";

        case "failed":
            return "#991b1b";

        case "preparing":
        case "uploading":
            return "#1d4ed8";

        default:
            return "#52525b";
    }
}

function validateFiles(
    files: File[],
    mode: UploadMode,
): string | null {
    if (files.length === 0) {
        return "Select at least one document.";
    }

    if (
        mode === "single" &&
        files.length !== 1
    ) {
        return "Single-file mode accepts exactly one document.";
    }

    if (
        mode === "multiple" &&
        files.length > MAX_FILES_PER_BATCH
    ) {
        return `You can upload at most ${MAX_FILES_PER_BATCH} files at a time.`;
    }

    const totalSizeBytes = files.reduce(
        (total, file) => total + file.size,
        0,
    );

    if (
        totalSizeBytes >
        MAX_BATCH_UPLOAD_SIZE_BYTES
    ) {
        return (
            `The total batch size must not exceed ` +
            `${formatFileSize(MAX_BATCH_UPLOAD_SIZE_BYTES)}.`
        );
    }

    for (const file of files) {
        if (file.size <= 0) {
            return `${file.name} is empty.`;
        }

        if (
            file.size >
            MAX_UPLOAD_SIZE_BYTES
        ) {
            return (
                `${file.name} exceeds the per-file limit of ` +
                `${formatFileSize(MAX_UPLOAD_SIZE_BYTES)}.`
            );
        }

        if (!getDocumentMimeType(file)) {
            return (
                `${file.name} is unsupported. ` +
                `Only PDF, DOCX and TXT files are allowed.`
            );
        }
    }

    return null;
}

export function DocumentUpload() {
    const fileInputRef =
        useRef<HTMLInputElement>(null);

    const [mode, setMode] =
        useState<UploadMode>("single");

    const [items, setItems] =
        useState<SelectedFileItem[]>([]);

    const [globalError, setGlobalError] =
        useState<string | null>(null);

    const [isPreparing, setIsPreparing] =
        useState(false);

    const isUploading = items.some(
        (item) =>
            item.status === "preparing" ||
            item.status === "uploading",
    );

    const isBusy =
        isPreparing || isUploading;

    const successfulCount = items.filter(
        (item) => item.status === "success",
    ).length;

    const failedCount = items.filter(
        (item) => item.status === "failed",
    ).length;

    const totalSelectedSize =
        items.reduce(
            (total, item) =>
                total + item.file.size,
            0,
        );

    function clearFileInput(): void {
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    function resetUpload(): void {
        setItems([]);
        setGlobalError(null);
        setIsPreparing(false);
        clearFileInput();
    }

    function handleModeChange(
        nextMode: UploadMode,
    ): void {
        if (isBusy) {
            return;
        }

        setMode(nextMode);
        resetUpload();
    }

    function handleFileChange(
        event: ChangeEvent<HTMLInputElement>,
    ): void {
        const selectedFiles = Array.from(
            event.target.files ?? [],
        );

        /*
         * In single mode, keep only the first file.
         */
        const normalizedFiles =
            mode === "single"
                ? selectedFiles.slice(0, 1)
                : selectedFiles;

        const validationError = validateFiles(
            normalizedFiles,
            mode,
        );

        if (validationError) {
            setItems([]);
            setGlobalError(validationError);
            event.target.value = "";

            return;
        }

        setGlobalError(null);

        setItems(
            normalizedFiles.map((file) => ({
                id: crypto.randomUUID(),
                file,
                status: "selected",
            })),
        );
    }

    function removeFile(
        itemId: string,
    ): void {
        if (isBusy) {
            return;
        }

        setItems((currentItems) =>
            currentItems.filter(
                (item) => item.id !== itemId,
            ),
        );

        setGlobalError(null);
    }

    function updateItem(
        itemId: string,
        updates: Partial<SelectedFileItem>,
    ): void {
        setItems((currentItems) =>
            currentItems.map((item) =>
                item.id === itemId
                    ? {
                        ...item,
                        ...updates,
                    }
                    : item,
            ),
        );
    }

    async function uploadSingleFile(
        item: SelectedFileItem,
    ): Promise<void> {
        updateItem(item.id, {
            status: "preparing",
            error: undefined,
            documentId: undefined,
        });

        const uploadSession =
            await createDocumentUploadSession(
                item.file,
            );

        updateItem(item.id, {
            status: "uploading",
        });

        await uploadFileDirectlyToS3(
            item.file,
            uploadSession,
        );

        updateItem(item.id, {
            status: "success",
            documentId:
                uploadSession.document.id,
            error: undefined,
        });
    }

    async function uploadMultipleFiles(
        selectedItems: SelectedFileItem[],
    ): Promise<void> {
        /*
         * First create all upload sessions in one API call.
         */
        setItems((currentItems) =>
            currentItems.map((item) => ({
                ...item,
                status: "preparing",
                error: undefined,
                documentId: undefined,
            })),
        );

        const files = selectedItems.map(
            (item) => item.file,
        );

        const uploadSessions =
            await createMultipleDocumentUploadSessions(
                files,
            );

        if (
            uploadSessions.length !==
            selectedItems.length
        ) {
            throw new Error(
                "The API returned an incorrect number of upload sessions.",
            );
        }

        /*
         * Upload files sequentially.
         *
         * We can add limited concurrency later.
         * Sequential upload is simpler for the first version.
         */
        for (
            let index = 0;
            index < selectedItems.length;
            index += 1
        ) {
            const item = selectedItems[index];
            const uploadSession =
                uploadSessions[index];

            if (!item || !uploadSession) {
                continue;
            }

            updateItem(item.id, {
                status: "uploading",
            });

            try {
                await uploadFileDirectlyToS3(
                    item.file,
                    uploadSession,
                );

                updateItem(item.id, {
                    status: "success",
                    documentId:
                        uploadSession.document.id,
                    error: undefined,
                });
            } catch (error) {
                updateItem(item.id, {
                    status: "failed",
                    error:
                        error instanceof Error
                            ? error.message
                            : "The file could not be uploaded.",
                });

                /*
                 * Continue uploading the remaining files.
                 *
                 * One file failing should not stop
                 * the complete batch.
                 */
            }
        }
    }

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        const files = items.map(
            (item) => item.file,
        );

        const validationError = validateFiles(
            files,
            mode,
        );

        if (validationError) {
            setGlobalError(validationError);
            return;
        }

        try {
            setGlobalError(null);
            setIsPreparing(true);

            if (mode === "single") {
                const firstItem = items[0];

                if (!firstItem) {
                    throw new Error(
                        "No document was selected.",
                    );
                }

                await uploadSingleFile(
                    firstItem,
                );
            } else {
                await uploadMultipleFiles(
                    items,
                );
            }
        } catch (error) {
            console.error(
                "Document upload failed:",
                error,
            );

            const errorMessage =
                error instanceof Error
                    ? error.message
                    : "The upload could not be completed.";

            setGlobalError(errorMessage);

            /*
             * Mark items still preparing/uploading
             * as failed.
             */
            setItems((currentItems) =>
                currentItems.map((item) => {
                    if (
                        item.status === "preparing" ||
                        item.status === "uploading"
                    ) {
                        return {
                            ...item,
                            status: "failed",
                            error: errorMessage,
                        };
                    }

                    return item;
                }),
            );
        } finally {
            setIsPreparing(false);
        }
    }

    return (
        <section
            style={{
                width: "100%",
                maxWidth: "760px",
                padding: "32px",
                border: "1px solid #d4d4d8",
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
                        lineHeight: 1.2,
                    }}
                >
                    Upload documents
                </h1>

                <p
                    style={{
                        marginTop: "8px",
                        marginBottom: 0,
                        color: "#52525b",
                        lineHeight: 1.5,
                    }}
                >
                    Choose whether to upload one
                    document or several documents.
                    Files are uploaded directly from
                    your browser to Amazon S3.
                </p>
            </header>

            <div
                role="group"
                aria-label="Upload mode"
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(2, minmax(0, 1fr))",
                    gap: "12px",
                    marginBottom: "24px",
                }}
            >
                <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                        handleModeChange("single")
                    }
                    style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border:
                            mode === "single"
                                ? "2px solid #18181b"
                                : "1px solid #a1a1aa",
                        background:
                            mode === "single"
                                ? "#f4f4f5"
                                : "#ffffff",
                        fontWeight: 700,
                        cursor: isBusy
                            ? "not-allowed"
                            : "pointer",
                    }}
                >
                    Single file
                </button>

                <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                        handleModeChange("multiple")
                    }
                    style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        border:
                            mode === "multiple"
                                ? "2px solid #18181b"
                                : "1px solid #a1a1aa",
                        background:
                            mode === "multiple"
                                ? "#f4f4f5"
                                : "#ffffff",
                        fontWeight: 700,
                        cursor: isBusy
                            ? "not-allowed"
                            : "pointer",
                    }}
                >
                    Multiple files
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <label
                    htmlFor="document-file-input"
                    style={{
                        display: "block",
                        marginBottom: "8px",
                        fontWeight: 600,
                    }}
                >
                    {mode === "single"
                        ? "Choose one document"
                        : `Choose up to ${MAX_FILES_PER_BATCH} documents`}
                </label>

                <input
                    ref={fileInputRef}
                    id="document-file-input"
                    name="documents"
                    type="file"
                    multiple={mode === "multiple"}
                    accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                    disabled={isBusy}
                    onChange={handleFileChange}
                    style={{
                        display: "block",
                        width: "100%",
                        padding: "12px",
                        border: "1px solid #a1a1aa",
                        borderRadius: "8px",
                        boxSizing: "border-box",
                    }}
                />

                <p
                    style={{
                        marginTop: "8px",
                        marginBottom: 0,
                        color: "#71717a",
                        fontSize: "14px",
                        lineHeight: 1.5,
                    }}
                >
                    Allowed: PDF, DOCX and TXT.
                    Maximum per file:{" "}
                    {formatFileSize(
                        MAX_UPLOAD_SIZE_BYTES,
                    )}
                    . Maximum total batch size:{" "}
                    {formatFileSize(
                        MAX_BATCH_UPLOAD_SIZE_BYTES,
                    )}
                    .
                </p>

                {items.length > 0 && (
                    <div
                        style={{
                            marginTop: "24px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent:
                                    "space-between",
                                gap: "16px",
                                marginBottom: "12px",
                            }}
                        >
                            <strong>
                                {items.length}{" "}
                                {items.length === 1
                                    ? "document"
                                    : "documents"}
                            </strong>

                            <span
                                style={{
                                    color: "#52525b",
                                }}
                            >
                                {formatFileSize(
                                    totalSelectedSize,
                                )}
                            </span>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gap: "10px",
                            }}
                        >
                            {items.map((item) => (
                                <article
                                    key={item.id}
                                    style={{
                                        padding: "14px",
                                        border:
                                            "1px solid #e4e4e7",
                                        borderRadius: "10px",
                                        background: "#fafafa",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent:
                                                "space-between",
                                            alignItems:
                                                "flex-start",
                                            gap: "16px",
                                        }}
                                    >
                                        <div
                                            style={{
                                                minWidth: 0,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    fontWeight: 700,
                                                    overflowWrap:
                                                        "anywhere",
                                                }}
                                            >
                                                {item.file.name}
                                            </div>

                                            <div
                                                style={{
                                                    marginTop: "4px",
                                                    color: "#52525b",
                                                    fontSize: "14px",
                                                }}
                                            >
                                                {formatFileSize(
                                                    item.file.size,
                                                )}
                                            </div>
                                        </div>

                                        {!isBusy &&
                                            item.status ===
                                            "selected" && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        removeFile(
                                                            item.id,
                                                        )
                                                    }
                                                    style={{
                                                        border: 0,
                                                        background:
                                                            "transparent",
                                                        color:
                                                            "#991b1b",
                                                        cursor:
                                                            "pointer",
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                    </div>

                                    <div
                                        style={{
                                            marginTop: "10px",
                                            color:
                                                getStatusColor(
                                                    item.status,
                                                ),
                                            fontSize: "14px",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {getStatusLabel(
                                            item.status,
                                        )}
                                    </div>

                                    {item.documentId && (
                                        <div
                                            style={{
                                                marginTop: "6px",
                                                color: "#52525b",
                                                fontSize: "12px",
                                                overflowWrap:
                                                    "anywhere",
                                            }}
                                        >
                                            Document ID:{" "}
                                            {item.documentId}
                                        </div>
                                    )}

                                    {item.error && (
                                        <div
                                            role="alert"
                                            style={{
                                                marginTop: "8px",
                                                color: "#991b1b",
                                                fontSize: "14px",
                                            }}
                                        >
                                            {item.error}
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        gap: "12px",
                        marginTop: "24px",
                    }}
                >
                    <button
                        type="submit"
                        disabled={
                            items.length === 0 ||
                            isBusy
                        }
                        style={{
                            flex: 1,
                            padding: "12px 16px",
                            border: 0,
                            borderRadius: "8px",
                            background:
                                items.length === 0 ||
                                    isBusy
                                    ? "#a1a1aa"
                                    : "#18181b",
                            color: "#ffffff",
                            fontWeight: 700,
                            cursor:
                                items.length === 0 ||
                                    isBusy
                                    ? "not-allowed"
                                    : "pointer",
                        }}
                    >
                        {isPreparing
                            ? "Preparing upload..."
                            : isUploading
                                ? "Uploading to S3..."
                                : mode === "single"
                                    ? "Upload document"
                                    : `Upload ${items.length} documents`}
                    </button>

                    {items.length > 0 &&
                        !isBusy && (
                            <button
                                type="button"
                                onClick={resetUpload}
                                style={{
                                    padding: "12px 16px",
                                    border:
                                        "1px solid #a1a1aa",
                                    borderRadius: "8px",
                                    background: "#ffffff",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                }}
                            >
                                Clear
                            </button>
                        )}
                </div>
            </form>

            {globalError && (
                <div
                    role="alert"
                    style={{
                        marginTop: "20px",
                        padding: "12px",
                        borderRadius: "8px",
                        background: "#fef2f2",
                        color: "#991b1b",
                    }}
                >
                    {globalError}
                </div>
            )}

            {items.length > 0 &&
                !isBusy &&
                (successfulCount > 0 ||
                    failedCount > 0) && (
                    <div
                        style={{
                            marginTop: "20px",
                            padding: "16px",
                            borderRadius: "8px",
                            background:
                                failedCount > 0
                                    ? "#fff7ed"
                                    : "#f0fdf4",
                            color:
                                failedCount > 0
                                    ? "#9a3412"
                                    : "#166534",
                        }}
                    >
                        <strong>
                            Upload completed
                        </strong>

                        <div
                            style={{
                                marginTop: "6px",
                            }}
                        >
                            Successful:{" "}
                            {successfulCount}

                            {failedCount > 0 && (
                                <>
                                    {" "}
                                    · Failed:{" "}
                                    {failedCount}
                                </>
                            )}
                        </div>
                    </div>
                )}
        </section>
    );
}