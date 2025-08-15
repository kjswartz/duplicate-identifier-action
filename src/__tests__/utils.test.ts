import { describe, it, expect } from "bun:test";
import {
  buildCurrentIssueSummary,
  buildBatchUserContent,
  systemPromptMsg,
  verifyJsonResponse,
  verifyIssueStateInput,
  processDateInput,
  chunk,
  buildCommentBody,
} from "../utils";
import type { Issue, ParsedOutput } from "../types";

describe("buildCurrentIssueSummary", () => {
  it("should build a summary with issue number, title, and body", () => {
    const issueNumber = 123;
    const issueTitle = "Test Issue";
    const issueBody = "This is a test issue body.";

    const expectedSummary = `Current Issue (#${issueNumber})\nTitle: ${issueTitle}\nBody:\n${issueBody}`;
    const result = buildCurrentIssueSummary(issueNumber, issueTitle, issueBody);

    expect(result).toBe(expectedSummary);
  });

  it("should handle empty title and body", () => {
    const issueNumber = 456;
    const issueTitle = "";
    const issueBody = "";

    const expectedSummary = `Current Issue (#${issueNumber})\nTitle: \nBody:\n`;
    const result = buildCurrentIssueSummary(issueNumber, issueTitle, issueBody);

    expect(result).toBe(expectedSummary);
  });

  it("should handle special characters in title and body", () => {
    const issueNumber = 789;
    const issueTitle = "Issue with special characters: !@#$%^&*()";
    const issueBody = "Body with special characters: <>,./?;:'\"[]{}|\\`~";

    const expectedSummary = `Current Issue (#${issueNumber})\nTitle: ${issueTitle}\nBody:\n${issueBody}`;
    const result = buildCurrentIssueSummary(issueNumber, issueTitle, issueBody);

    expect(result).toBe(expectedSummary);
  });
});

describe("buildBatchUserContent", () => {
  it("should build user content with system prompt, current issue summary, and batch issues", () => {
    const currentIssueSummary = "Current Issue Summary";
    const batchId = 1;
    const batch: Issue[] = [
      {
        number: 101,
        state: "open",
        title: "Batch Issue 1",
        body: "Body of batch issue 1",
        createdAt: "",
        updatedAt: "",
      },
      {
        number: 102,
        state: "closed",
        title: "Batch Issue 2",
        body: "Body of batch issue 2",
        createdAt: "",
        updatedAt: "",
      },
    ];

    const expectedContent = `${systemPromptMsg}

Current Issue Summary

Candidate Issues (Batch 1):
#101 Batch Issue 1
Body of batch issue 1
---
#102 Batch Issue 2
Body of batch issue 2`;

    const result = buildBatchUserContent(currentIssueSummary, batchId, batch);

    expect(result).toBe(expectedContent);
  });

  it("should throw an error for empty batch", () => {
    const currentIssueSummary = "Current Issue Summary";
    const batchId = 2;
    const batch: Issue[] = [];

    expect(() =>
      buildBatchUserContent(currentIssueSummary, batchId, batch),
    ).toThrow("Batch cannot be empty");
  });
});

describe("verifyJsonResponse", () => {
  it("should return true for valid ParsedOutput array", () => {
    const validData = [
      { issue: 1, likelihood: "high", reason: "Similar issue" },
      { issue: 2, likelihood: "medium", reason: "Some overlap" },
      { issue: 3, likelihood: "low" },
    ];

    expect(verifyJsonResponse(validData)).toBe(true);
  });

  it("should return false for non-array input", () => {
    const invalidData = { issue: 1, likelihood: "high" };
    expect(verifyJsonResponse(invalidData)).toBe(false);
  });

  it("should return false for array with non-object items", () => {
    const invalidData = [1, 2, 3];
    expect(verifyJsonResponse(invalidData)).toBe(false);
  });

  it("should return false for object missing 'issue' property", () => {
    const invalidData: Record<string, string>[] = [{ likelihood: "high" }];
    expect(verifyJsonResponse(invalidData)).toBe(false);
  });

  it("should return false for object with non-number 'issue'", () => {
    const invalidData: Record<string, string>[] = [
      { issue: "one", likelihood: "high" },
    ];
    expect(verifyJsonResponse(invalidData)).toBe(false);
  });

  it("should return false for object with invalid 'likelihood'", () => {
    const invalidData: Record<string, string | number>[] = [
      { issue: 1, likelihood: "certain" },
    ];
    expect(verifyJsonResponse(invalidData)).toBe(false);
  });

  it("should return true for empty array", () => {
    const validData: ParsedOutput[] = [];
    expect(verifyJsonResponse(validData)).toBe(true);
  });
});

describe("verifyIssueStateInput", () => {
  it("should return the same valid issue state", () => {
    expect(verifyIssueStateInput("all")).toBe("all");
    expect(verifyIssueStateInput("open")).toBe("open");
    expect(verifyIssueStateInput("closed")).toBe("closed");
  });

  it("should throw an error for invalid issue state", () => {
    expect(() => verifyIssueStateInput("invalid")).toThrow(
      "Invalid issue state: invalid. Valid states are: all, open, closed",
    );
    expect(() => verifyIssueStateInput("")).toThrow(
      "Invalid issue state: . Valid states are: all, open, closed",
    );
    expect(() => verifyIssueStateInput("OPEN")).toThrow(
      "Invalid issue state: OPEN. Valid states are: all, open, closed",
    );
  });
});

describe("processDateInput", () => {
  it("should return ISO string for valid date input", () => {
    const dateStr = "2023-10-01T12:00:00Z";
    expect(processDateInput(dateStr)).toBe(new Date(dateStr).toISOString());

    const dateStr2 = "2023-10-01";
    expect(processDateInput(dateStr2)).toBe(new Date(dateStr2).toISOString());
  });

  it("should throw an error for invalid date input", () => {
    expect(() => processDateInput("invalid-date")).toThrow(
      "Invalid date format: invalid-date. Please provide a valid date.",
    );
    expect(() => processDateInput("2023-13-01")).toThrow(
      "Invalid date format: 2023-13-01. Please provide a valid date.",
    );
    expect(() => processDateInput("")).toThrow(
      "Invalid date format: . Please provide a valid date.",
    );
  });
});

describe("chunk", () => {
  it("should chunk an array into smaller arrays of specified size", () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    expect(chunk(arr, 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(chunk(arr, 2)).toEqual([[1, 2], [3, 4], [5, 6], [7]]);
    expect(chunk(arr, 1)).toEqual([[1], [2], [3], [4], [5], [6], [7]]);
    expect(chunk(arr, 10)).toEqual([[1, 2, 3, 4, 5, 6, 7]]);
  });

  it("should return empty array when input array is empty", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("should handle size larger than array length", () => {
    const arr = [1, 2, 3];
    expect(chunk(arr, 5)).toEqual([[1, 2, 3]]);
  });
});

describe("buildCommentBody", () => {
  it("should build a comment body with outputs and issues to compare", () => {
    const outputs: ParsedOutput[] = [
      { issue: 1, likelihood: "high", reason: "Similar issue" },
      { issue: 2, likelihood: "medium", reason: "Some overlap" },
    ];
    const issuesToCompare: Issue[] = [
      {
        number: 1,
        state: "open",
        title: "Issue One",
        body: "Description of issue one",
        createdAt: "",
        updatedAt: "",
      },
      {
        number: 2,
        state: "closed",
        title: "Issue Two",
        body: "Description of issue two",
        createdAt: "",
        updatedAt: "",
      },
    ];

    const expectedBody = `## ⚠️ Potential Duplicate/Semantically Similar Issues Identified
The following issues may be duplicates or semantically similar to the current issue. Please review them:

**Issue** #1: **high**
**Title:** Issue One
**State:** open
**Reason:** Similar issue

**Issue** #2: **medium**
**Title:** Issue Two
**State:** closed
**Reason:** Some overlap
`;

    const result = buildCommentBody(outputs, issuesToCompare);
    expect(result).toBe(expectedBody);
  });

  it("should return 'No similar issues found.' when outputs are empty", () => {
    const outputs: ParsedOutput[] = [];
    const issuesToCompare: Issue[] = [];

    const expectedBody = "No similar issues found.";
    const result = buildCommentBody(outputs, issuesToCompare);

    expect(result).toBe(expectedBody);
  });

  it("should handle cases with missing issue details", () => {
    const outputs: ParsedOutput[] = [{ issue: 3, likelihood: "low" }];
    const issuesToCompare: Issue[] = [
      {
        number: 3,
        state: "open",
        title: "",
        body: "",
        createdAt: "",
        updatedAt: "",
      },
    ];

    const expectedBody = `## ⚠️ Potential Duplicate/Semantically Similar Issues Identified
The following issues may be duplicates or semantically similar to the current issue. Please review them:

**Issue** #3: **low**
**Title:** N/A
**State:** open
**Reason:** N/A
`;

    const result = buildCommentBody(outputs, issuesToCompare);
    expect(result).toBe(expectedBody);
  });
});
