import type { EvalCaseResult, EvalSuiteReport } from "./types.js";

export function buildReport(suite: EvalSuiteReport["suite"], results: EvalCaseResult[]): EvalSuiteReport {
  const byCategory: EvalSuiteReport["summary"]["byCategory"] = {};
  for (const result of results) {
    byCategory[result.category] ??= { total: 0, passed: 0, failed: 0 };
    byCategory[result.category].total += 1;
    if (result.passed) {
      byCategory[result.category].passed += 1;
    } else {
      byCategory[result.category].failed += 1;
    }
  }

  const passed = results.filter((result) => result.passed).length;
  return {
    suite,
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      byCategory
    },
    results
  };
}
