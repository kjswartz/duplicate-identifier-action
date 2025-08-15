import { GitHub } from "@actions/github/lib/utils";

export type AiInferenceFn = (
  params: AiInferenceParams,
) => Promise<string | undefined>;

interface AiInferenceParams {
  systemPromptMsg: string;
  endpoint: string;
  modelName: string;
  maxTokens: number;
  token: string;
  content: string;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  state: string;
  createdAt: string;
  updatedAt: string;
}

export type GetIssuesFn = (params: GetIssuesParams) => Promise<Issue[]>;

interface GetIssuesParams {
  octokit: InstanceType<typeof GitHub>;
  owner: string;
  repo: string;
  issueNumber: number;
  issueState: "all" | "open" | "closed";
  timeFilter?: string;
}

export type CreateIssueCommentFn = (
  params: CreateCommentParams,
) => Promise<boolean>;

interface CreateCommentParams {
  octokit: InstanceType<typeof GitHub>;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export type AddIssueLabelsFn = (params: AddLabelsParams) => Promise<boolean>;

interface AddLabelsParams {
  octokit: InstanceType<typeof GitHub>;
  owner: string;
  repo: string;
  issueNumber: number;
  labels: string[];
}

export interface ParsedOutput {
  issue: number;
  likelihood: "high" | "medium" | "low";
  reason?: string;
}
