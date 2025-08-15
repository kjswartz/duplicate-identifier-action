import type {
  CreateIssueCommentFn,
  AddIssueLabelsFn,
  GetIssuesFn,
  Issue,
} from "./types";

export const getIssuesToCompare: GetIssuesFn = async ({
  octokit,
  owner,
  repo,
  issueNumber,
  issueState,
  timeFilter,
}) => {
  const collected: Issue[] = [];
  let page = 1;
  const per_page = 100;
  const optionsBase = {
    owner,
    repo,
    state: issueState,
    per_page,
    ...(timeFilter ? { since: timeFilter } : {}),
  };

  while (true) {
    try {
      const response = await octokit.rest.issues.listForRepo({
        ...optionsBase,
        page,
      });

      if (!response.data.length) break;

      const pageIssues: Issue[] = response.data
        .filter((issue) => issue.number !== issueNumber)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          body: issue.body || "",
          state: issue.state,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
        }));

      collected.push(...pageIssues);

      if (response.data.length < per_page) break;
      page += 1;
    } catch (error) {
      console.error("Error fetching issues (page", page, "):", error);
      break;
    }
  }

  return collected;
};

export const createIssueComment: CreateIssueCommentFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
  body,
}) => {
  try {
    const response = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });
    if (response.status === 201) {
      console.log("Comment created successfully:", response.data.html_url);
      return true;
    } else {
      console.error("Failed to create comment:", response.status);
      return false;
    }
  } catch (error) {
    console.error("Error creating issue comment:", error);
    return false;
  }
};

export const addIssueLabels: AddIssueLabelsFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
  labels,
}) => {
  try {
    await octokit.rest.issues.addLabels({ owner, repo, issue_number, labels });
    console.log("Labels added successfully");
    return true;
  } catch (error) {
    console.error("Error adding labels to issue:", error);
    return false;
  }
};
