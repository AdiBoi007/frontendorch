import pdf from "pdf-parse";
import { parseTextDocument } from "./text.js";

export async function parsePdfDocument(buffer: Buffer) {
  const result = await pdf(buffer);
  return parseTextDocument(result.text);
}
