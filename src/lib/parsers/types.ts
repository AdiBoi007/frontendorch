export interface ParsedSection {
  title: string;
  headingPath: string[];
  pageNumber: number | null;
  text: string;
}

export interface ParsedDocument {
  text: string;
  sections: ParsedSection[];
}
