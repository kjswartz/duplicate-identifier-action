import { context, getOctokit } from "@actions/github";
import { getInput, summary } from "@actions/core";
import { getIssuesToCompare, createIssueComment, addIssueLabels } from "./api";
import {
  verifyIssueStateInput,
  processDateInput,
  chunk,
  buildBatchUserContent,
  systemPromptMsg,
  buildCurrentIssueSummary,
  verifyJsonResponse,
} from "./utils";
import { aiInference } from "./ai";
import type { ParsedOutput } from "./types";

const main = async () => {
  // Required inputs
  const token = getInput("token") || process.env.GITHUB_TOKEN;
  const owner = getInput("owner") || context?.repo?.owner;
  const repo = getInput("repo_name") || context?.repo?.repo;

  const issueNumber = getInput("issue_number")
    ? parseInt(getInput("issue_number"), 10)
    : context?.payload?.issue?.number;
  const issueBody = getInput("issue_body");
  const issueTitle = getInput("issue_title");

  if (!token || !owner || !repo || !issueNumber || !issueBody || !issueTitle) {
    throw new Error("Required inputs are not set");
  }

  const octokit = getOctokit(token);

  // AI configuration
  const endpoint = getInput("endpoint");
  const modelName = getInput("model");
  const maxTokens = getInput("max_tokens")
    ? parseInt(getInput("max_tokens"), 10)
    : 200;
  const batchSize = getInput("batch_size")
    ? parseInt(getInput("batch_size"), 10)
    : 50;

  // Validate batch size
  if (batchSize <= 0 || batchSize > 100) {
    throw new Error("batch_size must be between 1 and 100");
  }

  const issueStateFilter = verifyIssueStateInput(
    getInput("issue_state_filter"),
  );
  const postComment = getInput("post_comment") === "true";
  const timeFilterInput = getInput("time_filter");
  const timeFilter = timeFilterInput
    ? processDateInput(timeFilterInput)
    : undefined;
  const labelsInput = getInput("labels");
  const labels = labelsInput
    ? labelsInput.split(",").map((label) => label.trim())
    : [];

  // Log configuration summary
  summary.addHeading("Configuration Summary");
  summary.addRaw(`- Owner: ${owner}`);
  summary.addRaw(`- Repo: ${repo}`);
  summary.addRaw(`- Issue Number: ${issueNumber}`);
  summary.addRaw(`- Issue State Filter: ${issueStateFilter}`);
  summary.addRaw(`- Time Filter: ${timeFilter || "None"}`);
  summary.addRaw(
    `- Labels to Add: ${labels.length > 0 ? labels.join(", ") : "None"}`,
  );
  summary.addRaw(`- AI Endpoint: ${endpoint}`);
  summary.addRaw(`- AI Model: ${modelName}`);
  summary.addRaw(`- Max Tokens: ${maxTokens}`);
  summary.addRaw(`- Batch Size: ${batchSize}`);
  summary.addRaw(`- Post Comment: ${postComment}`);

  // -------- Fetch Issues for Comparison ----------------------------------------
  summary.addHeading("Issues for Comparison Stats");
  console.log(`Fetching issues...`);

  const issuesToCompare = await getIssuesToCompare({
    octokit,
    owner,
    repo,
    issueNumber,
    issueStateFilter,
    timeFilter,
  });

  console.log(`Issues fetch complete.`);
  summary.addRaw(`- Issues Found: ${issuesToCompare.length}`);

  if (issuesToCompare.length === 0) {
    console.log("No issues found to compare.");
    summary.addRaw(`- No issues found for comparison.`);
    summary.write();
    return;
  }

  // -------- Batch Issues & AI Inference Loop -----------------------------------
  summary.addHeading("AI Inference Stats");

  const currentIssueSummary = buildCurrentIssueSummary(
    issueNumber,
    issueTitle,
    issueBody,
  );
  const batches = chunk(issuesToCompare, batchSize);

  console.log(
    `Processing ${batches.length} batch(es) of candidate issues (batch size = ${batchSize}).`,
  );
  summary.addRaw(`- Total Batches: ${batches.length}`);

  const aiOutputs: string[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!; // non-null assertion, batches elements are defined
    const batchId = (i + 1) / batches.length;
    const userContent = buildBatchUserContent(
      currentIssueSummary,
      batchId,
      batch,
    );

    console.log(
      `User Content (batch ${i + 1}): `,
      userContent.slice(0, 200),
      "...",
    );

    const aiResponse = await aiInference({
      token,
      content: userContent,
      systemPromptMsg,
      endpoint,
      maxTokens,
      modelName,
    });

    if (aiResponse) {
      aiOutputs.push(aiResponse);
      console.log(`AI response (batch ${i + 1}):`, aiResponse.slice(0, 200));
      summary.addRaw(`- Batch ${i + 1}: AI response received`);
    } else {
      console.log(`No AI response for batch ${i + 1}.`);
      summary.addRaw(`- Batch ${i + 1}: No AI response`);
    }
  }

  // -------- Parse & Process AI Responses ---------------------------------------
  summary.addHeading("Parse & Process AI Responses");
  let parsedOutputs: ParsedOutput[] = [];
  for (const response of aiOutputs) {
    try {
      const parsed = JSON.parse(response);
      console.log("Parsed AI Output:", parsed);
      if (verifyJsonResponse(parsed)) {
        parsedOutputs = parsed?.length
          ? parsedOutputs.concat(parsed)
          : parsedOutputs;
      } else {
        console.warn(
          "AI Output did not pass requested formatted response:",
          parsed,
        );
        summary.addRaw(
          `- AI Output did not pass requested format check logs for details.`,
        );
        continue;
      }
    } catch (error) {
      console.error("Error parsing AI Output:", error);
      summary.addRaw(
        `- Error parsing AI response: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      continue;
    }
  }

  console.log(`Total parsed similar issues from AI: ${parsedOutputs.length}`);
  summary.addRaw(
    `- Total Parsed Similar Issues from AI: ${parsedOutputs.length}`,
  );

  if (parsedOutputs.length === 0) {
    console.log("No similar issues identified by AI.");
    summary.addRaw(`- No similar issues identified by AI.`);
    summary.write();
    return;
  }
  // -------- Create Comment ---------------------------------------
  const commentLines = [
    "## ⚠️ Potential Duplicate/Semantically Similar Issues Identified",
    "The following issues may be duplicates or semantically similar to the current issue. Please review them:",
    "",
  ];

  for (const output of parsedOutputs) {
    const issue = issuesToCompare.find(({ number }) => number == output.issue);
    commentLines.push(`**Issue** #${output.issue}: **${output.likelihood}**`);
    commentLines.push(`**Title:** ${issue?.title || "N/A"}`);
    commentLines.push(`**Reason:** ${output?.reason || "N/A"}`);
    commentLines.push("");
  }
  const commentBody = commentLines.join("\n");
  summary.addHeading("Comment & Labels Summary");
  summary.addRaw(commentBody);

  if (postComment) {
    console.log("Posting comment...");
    const commentSuccess = await createIssueComment({
      octokit,
      owner,
      repo,
      issueNumber,
      body: commentBody,
    });
    if (commentSuccess) {
      summary.addRaw(`- Comment posted successfully.`);
    } else {
      summary.addRaw(`- Failed to post comment.`);
    }
  }

  if (labels.length > 0) {
    const addLabelsSuccess = await addIssueLabels({
      octokit,
      owner,
      repo,
      issueNumber,
      labels,
    });
    if (addLabelsSuccess) {
      summary.addRaw(`- Labels added: ${labels.join(", ")}`);
    } else {
      summary.addRaw(`- Failed to add labels: ${labels.join(", ")}`);
    }
  }
  console.log("Action completed successfully.");
  summary.addRaw(`- Action completed successfully.`);
  summary.write();
  return;
};

if (process.env.NODE_ENV !== "test") {
  main();
}
