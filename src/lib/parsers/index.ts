import { parseDocxDocument } from "./docx.js";
import { parsePdfDocument } from "./pdf.js";
import { parseTextDocument } from "./text.js";

export async function parseDocumentBuffer(contentType: string, buffer: Buffer, fallbackFileName?: string) {
  const normalized = contentType.toLowerCase();
  const fileName = fallbackFileName?.toLowerCase() ?? "";

  if (normalized.includes("pdf") || fileName.endsWith(".pdf")) {
    return parsePdfDocument(buffer);
  }

  if (normalized.includes("word") || fileName.endsWith(".docx")) {
    return parseDocxDocument(buffer);
  }

  return parseTextDocument(buffer.toString("utf8"));
}
