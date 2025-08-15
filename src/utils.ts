import type { Issue, ParsedOutput } from "./types";

export const systemPromptMsg = `You are an assistant that identifies potential duplicate or semantically similar GitHub issues.
Return ONLY a JSON array. Include ONLY issues that have meaningful similarity to the current issue.
Output format example: [{"issue":23,"likelihood":"high", "reason":"Both issues refer to fixing a similar bug in the authentication flow."},{"issue":30,"likelihood":"medium","reason":"Some overlapping content in the mention of processing error codes."}]
Rules:
- likelihood must be one of: high | medium | low
- Provide at most 15 items.
- If no sufficiently similar issues exist, return []
- DO NOT add commentary, markdown, code fences, or any text outside the raw JSON array.`;

export const buildCurrentIssueSummary = (
  issueNumber: number,
  issueTitle: string,
  issueBody: string,
): string => {
  return `Current Issue (#${issueNumber})\nTitle: ${issueTitle}\nBody:\n${issueBody}`;
};

export const buildBatchUserContent = (
  currentIssueSummary: string,
  batchId: number,
  batch: Issue[],
): string => {
  if (batch.length === 0) {
    throw new Error("Batch cannot be empty");
  }
  const batchText = batch
    .map((issue) => `#${issue.number} ${issue.title}\n${issue.body}`)
    .join("\n---\n");

  return `${systemPromptMsg}\n\n${currentIssueSummary}\n\nCandidate Issues (Batch ${batchId}):\n${batchText}`;
};

export const verifyIssueStateInput = (
  issueState: string,
): "all" | "open" | "closed" => {
  const validStates: ("all" | "open" | "closed")[] = ["all", "open", "closed"];
  if (validStates.includes(issueState as "all" | "open" | "closed")) {
    return issueState as "all" | "open" | "closed";
  }
  throw new Error(
    `Invalid issue state: ${issueState}. Valid states are: ${validStates.join(", ")}`,
  );
};

export const processDateInput = (date: string): string => {
  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    throw new Error(
      `Invalid date format: ${date}. Please provide a valid date.`,
    );
  }
  return parsedDate.toISOString();
};

export const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const verifyJsonResponse = (data: unknown): data is ParsedOutput[] => {
  if (!Array.isArray(data)) return false;
  for (const item of data) {
    if (typeof item !== "object" || item === null) return false;
    if (typeof item.issue !== "number") return false;
    if (!["high", "medium", "low"].includes(item?.likelihood?.toLowerCase()))
      return false;
  }
  return true;
};

export const buildCommentBody = (
  outputs: ParsedOutput[],
  issuesToCompare: Issue[],
): string => {
  if (outputs.length === 0) {
    return "No similar issues found.";
  }

  const commentLines = [
    "## ⚠️ Potential Duplicate/Semantically Similar Issues Identified",
    "The following issues may be duplicates or semantically similar to the current issue. Please review them:",
    "",
  ];

  for (const output of outputs) {
    const issue = issuesToCompare.find(({ number }) => number === output.issue);
    commentLines.push(`**Issue** #${output.issue}: **${output.likelihood}**`);
    commentLines.push(`**Title:** ${issue?.title || "N/A"}`);
    commentLines.push(`**State:** ${issue?.state || "N/A"}`);
    commentLines.push(`**Reason:** ${output?.reason || "N/A"}`);
    commentLines.push("");
  }

  return commentLines.join("\n");
};
