/**
 * Tests the Zod schemas that validate Socrates input/output.
 * These are purely unit tests — no DB or LLM involved.
 */

import { describe, expect, it } from "vitest";
import {
  answerSchema,
  createSessionBodySchema,
  patchContextBodySchema,
  streamMessageBodySchema,
} from "../src/modules/socrates/schemas.js";

describe("createSessionBodySchema", () => {
  it("accepts a valid session creation body", () => {
    const body = {
      pageContext: "brain_graph",
      selectedRefType: "brain_node",
      selectedRefId: "11111111-1111-1111-1111-111111111111",
    };
    expect(() => createSessionBodySchema.parse(body)).not.toThrow();
  });

  it("accepts minimal body with only pageContext", () => {
    expect(() => createSessionBodySchema.parse({ pageContext: "doc_viewer" })).not.toThrow();
  });

  it("rejects unknown pageContext", () => {
    expect(() => createSessionBodySchema.parse({ pageContext: "unknown_page" })).toThrow();
  });

  it("rejects invalid selectedRefId (non-UUID)", () => {
    expect(() =>
      createSessionBodySchema.parse({
        pageContext: "doc_viewer",
        selectedRefType: "document_section",
        selectedRefId: "not-a-uuid",
      })
    ).toThrow();
  });

  it("rejects bodies that provide selectedRefType without selectedRefId", () => {
    expect(() =>
      createSessionBodySchema.parse({
        pageContext: "brain_graph",
        selectedRefType: "brain_node",
      })
    ).toThrow();
  });
});

describe("patchContextBodySchema", () => {
  it("accepts null to clear selectedRef", () => {
    const body = { selectedRefType: null, selectedRefId: null };
    expect(() => patchContextBodySchema.parse(body)).not.toThrow();
  });

  it("accepts a pageContext update alone", () => {
    expect(() => patchContextBodySchema.parse({ pageContext: "dashboard_project" })).not.toThrow();
  });

  it("rejects partial selectedRef updates", () => {
    expect(() => patchContextBodySchema.parse({ selectedRefId: "11111111-1111-1111-1111-111111111111" })).toThrow();
  });
});

describe("streamMessageBodySchema", () => {
  it("accepts a normal message", () => {
    expect(() => streamMessageBodySchema.parse({ content: "What changed recently?" })).not.toThrow();
  });

  it("rejects empty content", () => {
    expect(() => streamMessageBodySchema.parse({ content: "" })).toThrow();
  });

  it("rejects content over 8000 chars", () => {
    expect(() => streamMessageBodySchema.parse({ content: "x".repeat(8001) })).toThrow();
  });
});

describe("answerSchema", () => {
  const validAnswer = {
    answer_md: "The feature was first introduced in the PRD.",
    citations: [
      {
        type: "product_brain",
        refId: "22222222-2222-2222-2222-222222222222",
        label: "Product Brain v3",
        confidence: 0.91,
      },
    ],
    open_targets: [
      {
        targetType: "document_section",
        targetRef: {
          anchorId: "feature_overview",
          documentVersionId: "33333333-3333-3333-3333-333333333333",
          pageNumber: 3,
        },
      },
    ],
    suggested_prompts: ["What changed in this section?"],
    confidence: 0.91,
  };

  it("accepts a valid complete answer", () => {
    expect(() => answerSchema.parse(validAnswer)).not.toThrow();
  });

  it("accepts answer with empty citations and targets", () => {
    expect(() =>
      answerSchema.parse({
        answer_md: "I don't have enough evidence to answer that.",
        citations: [],
        open_targets: [],
        suggested_prompts: [],
      })
    ).not.toThrow();
  });

  it("rejects answer with empty answer_md", () => {
    expect(() => answerSchema.parse({ ...validAnswer, answer_md: "" })).toThrow();
  });

  it("rejects answer with invalid citation type", () => {
    expect(() =>
      answerSchema.parse({
        ...validAnswer,
        citations: [
          { type: "unknown_type", refId: "22222222-2222-2222-2222-222222222222", label: "x" },
        ],
      })
    ).toThrow();
  });

  it("rejects answer with confidence outside 0–1", () => {
    expect(() => answerSchema.parse({ ...validAnswer, confidence: 1.5 })).toThrow();
  });

  it("rejects more than 5 suggested prompts", () => {
    expect(() =>
      answerSchema.parse({
        ...validAnswer,
        suggested_prompts: ["a", "b", "c", "d", "e", "f"],
      })
    ).toThrow();
  });
});
