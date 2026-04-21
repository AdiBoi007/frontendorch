import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvalSuiteReport } from "./types.js";

export async function loadJsonlFile<T>(filePath: string): Promise<T[]> {
  const raw = await readFile(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

export async function writeEvalReports(baseName: string, report: EvalSuiteReport) {
  const outputsDir = path.resolve("evals", "outputs");
  await mkdir(outputsDir, { recursive: true });
  const jsonPath = path.join(outputsDir, `${baseName}.json`);
  const mdPath = path.join(outputsDir, `${baseName}.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(mdPath, renderMarkdownReport(report));
  return { jsonPath, mdPath };
}

export function renderMarkdownReport(report: EvalSuiteReport) {
  const summaryLines = Object.entries(report.summary.byCategory)
    .map(([category, counts]) => `| ${category} | ${counts.total} | ${counts.passed} | ${counts.failed} |`)
    .join("\n");

  const failedLines = report.results
    .filter((result) => !result.passed)
    .map((result) => {
      const reasons = result.reasons.length > 0 ? result.reasons.join("; ") : "No failure reason recorded";
      return `- \`${result.id}\` (${result.category}) — ${reasons}`;
    })
    .join("\n");

  return [
    `# ${report.suite} eval report`,
    "",
    `Generated at: ${report.generatedAt}`,
    "",
    `- Total: ${report.summary.total}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    "",
    "## By category",
    "",
    "| Category | Total | Passed | Failed |",
    "| --- | ---: | ---: | ---: |",
    summaryLines,
    "",
    "## Failures",
    "",
    failedLines || "- None"
  ].join("\n");
}
