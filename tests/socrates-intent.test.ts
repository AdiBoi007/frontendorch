import { describe, expect, it } from "vitest";
import { classifyIntent } from "../src/lib/retrieval/intent.js";

describe("classifyIntent", () => {
  it("classifies provenance queries as original_source", () => {
    expect(classifyIntent("Where was this feature first mentioned?")).toBe("original_source");
    expect(classifyIntent("What did the original PRD say about reporting?")).toBe("original_source");
    expect(classifyIntent("Which Slack message introduced this requirement?")).toBe("original_source");
  });

  it("classifies change queries as change_history", () => {
    expect(classifyIntent("What changed recently?")).toBe("change_history");
    expect(classifyIntent("Show me the change history for this feature")).toBe("change_history");
    expect(classifyIntent("List all accepted changes this week")).toBe("change_history");
  });

  it("classifies decision queries as decision_history", () => {
    expect(classifyIntent("Was this decided by the manager?")).toBe("decision_history");
    expect(classifyIntent("Show decision records for auth")).toBe("decision_history");
    expect(classifyIntent("Why was this approach chosen?")).toBe("decision_history");
  });

  it("classifies current-state queries as current_truth", () => {
    expect(classifyIntent("What is the current requirement for login?")).toBe("current_truth");
    expect(classifyIntent("What are the accepted flows?")).toBe("current_truth");
    expect(classifyIntent("What should engineering follow now?")).toBe("current_truth");
  });

  it("classifies dashboard queries as dashboard_status", () => {
    expect(classifyIntent("Summarize project status")).toBe("dashboard_status");
    expect(classifyIntent("Show workload pressure")).toBe("dashboard_status");
  });

  it("classifies comparison queries as comparison_or_diff", () => {
    expect(classifyIntent("Compare the original and current requirement")).toBe("comparison_or_diff");
    expect(classifyIntent("What is different between version 1 and version 2?")).toBe("comparison_or_diff");
  });

  it("classifies brain structure queries as brain_local", () => {
    expect(classifyIntent("What does this module depend on?")).toBe("brain_local");
    expect(classifyIntent("Show the brain graph architecture")).toBe("brain_local");
  });

  it("classifies communication queries as communication_lookup", () => {
    expect(classifyIntent("Find the Slack message from last week")).toBe("communication_lookup");
    expect(classifyIntent("What did someone say in the Gmail thread?")).toBe("communication_lookup");
  });

  it("falls back to current_truth for generic questions", () => {
    expect(classifyIntent("Hello what is going on")).toBe("current_truth");
  });
});
