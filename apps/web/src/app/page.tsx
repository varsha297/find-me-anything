import { DocumentAsk } from "@/components/documents/DocumentAsk";
import { DocumentUpload } from "../components/documents/document-upload";

export default function DocumentsPage() {
    return (
        <main
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                background: "#f4f4f5",
            }}
        >
            <DocumentAsk />
            <DocumentUpload />
        </main>
    );
}