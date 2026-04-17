import mammoth from "mammoth";
import { parseTextDocument } from "./text.js";

export async function parseDocxDocument(buffer: Buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return parseTextDocument(result.value);
}
