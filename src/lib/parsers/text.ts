import type { ParsedDocument, ParsedSection } from "./types.js";

function splitMarkdownSections(content: string): ParsedSection[] {
  const lines = content.split(/\r?\n/);
  const sections: ParsedSection[] = [];
  let currentTitle = "Introduction";
  let currentHeadingPath = [currentTitle];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (!text) {
      return;
    }

    sections.push({
      title: currentTitle,
      headingPath: currentHeadingPath,
      pageNumber: null,
      text
    });
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      flush();
      const level = headingMatch[1].length;
      currentTitle = headingMatch[2].trim();
      currentHeadingPath = [...currentHeadingPath.slice(0, Math.max(level - 1, 0)), currentTitle];
      continue;
    }

    buffer.push(line);
  }

  flush();

  if (sections.length === 0) {
    sections.push({
      title: "Document",
      headingPath: ["Document"],
      pageNumber: null,
      text: content.trim()
    });
  }

  return sections;
}

export function parseTextDocument(content: string): ParsedDocument {
  return {
    text: content,
    sections: splitMarkdownSections(content)
  };
}
