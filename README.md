# AI Duplicate Identifier Action

A GitHub Action (Node.js/TypeScript) that uses an AI model to detect potentially duplicate or semantically similar issues. It fetches existing issues, batches them, constructs a structured system and user prompt, invokes an AI chat completion endpoint, parses the model's JSON response, and (optionally) comments on the triggering issue and/or applies labels if potential duplicates are identified.

## Current Architecture

Implemented as a JavaScript action (Node 20 runtime) with a compiled TypeScript entrypoint (`dist/index.js`). High‑level flow:
1. Read & validate action inputs (issue metadata, filtering, AI config).
2. Fetch candidate issues via GitHub REST (paginated, filtered by state & optional created_at > `time_filter`).
3. Batch candidate issues (`batch_size`, max 100) and build a prompt per batch combining:
   - System instructions (strict JSON output requirement)
   - Current issue summary
   - Batch of candidate issues
4. Call AI Inference endpoint (`/chat/completions`) for each batch.
5. Parse each response as JSON; accept only arrays whose objects contain: `{ issue: number, likelihood: "high"|"medium"|"low", reason?: string }`.
6. Aggregate all accepted results.
7. If any matches:
   - (Optional) Post a formatted Markdown comment summarizing potential duplicates.
   - (Optional) Apply labels.
8. Always write a GitHub Step Summary with configuration + stats.

## Features
- 🤖 AI similarity detection via configurable model & endpoint (default endpoint: `https://models.github.ai/inference`).
- 🧩 Structured, deterministic system prompt enforcing raw JSON array output.
- 📦 Automatic batching of repository issues (configurable size 1–100).
- 🕒 Date filtering via ISO date (`YYYY-MM-DD`) to ignore older issues.
- 🏷 Optional automatic labeling when duplicates are detected.
- 💬 Optional issue comment summarizing findings.
- 📊 Rich GitHub Step Summary (configuration + fetch + AI parsing stats).
- 🛡 JSON shape validation rejects malformed model output.

## Usage
Minimal setup (issue opened trigger):
```yaml
name: Issue Duplicate Detection
on:
  issues:
    types: [opened]
permissions:
  issues: write   # needed to post a comment & add labels
  contents: read
  models: read    # required for GitHub Models endpoint
jobs:
  detect-duplicates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Detect duplicate issues
        uses: your-org/duplicate-identifier-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          issue_number: ${{ github.event.issue.number }}
          issue_title: ${{ github.event.issue.title }}
          issue_body: ${{ github.event.issue.body }}
          model: opeanai/gpt-4.1
```

Advanced configuration:
```yaml
- name: Detect duplicate issues
  uses: your-org/duplicate-identifier-action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    issue_number: ${{ github.event.issue.number }}
    issue_title: ${{ github.event.issue.title }}
    issue_body: ${{ github.event.issue.body }}
    owner: ${{ github.repository_owner }}          # optional; inferred by default
    repo_name: ${{ github.event.repository.name }} # optional; inferred by default
    batch_size: 40
    issue_state_filter: all              # open | closed | all
    time_filter: "2025-01-01"     # only issues created since this ISO date
    model: "opeanai/gpt-4.1-mini" # must exist for your endpoint
    max_tokens: 500               # per completion
    endpoint: "https://models.github.ai/inference"
    post_comment: true
    labels: "duplicate,needs-review"  # applied only if at least one match
```

## Inputs
| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `token` | yes | — | GitHub token used for REST API + AI endpoint auth (needs `issues:write`, `models:read`). |
| `issue_number` | yes | — | Number of the triggering issue. |
| `issue_title` | yes | — | Title of the triggering issue. |
| `issue_body` | yes | — | Body of the triggering issue. |
| `model` | yes | — | Model identifier. |
| `owner` | no | inferred | Repo owner (defaults to event context). |
| `repo_name` | no | inferred | Repository name (defaults to event context). |
| `batch_size` | no | 10 | Issues per AI request (1–100). |
| `issue_state_filter` | no | open | Candidate issue state filter (`open\|closed\|all`). |
| `time_filter` | no | — | ISO date (`YYYY-MM-DD`). Only issues updated since this date are considered. |
| `max_tokens` | no | 200 | Max tokens per completion response. |
| `endpoint` | no | `https://models.github.ai/inference` | AI inference base URL. |
| `post_comment` | no | true | Post a Markdown comment if matches found. |
| `labels` | no | — | Comma-separated labels to add when matches found. |

## Outputs
No explicit action outputs yet. Results surface via:
- Issue comment (if `post_comment: true` and matches present)
- Labels applied (if configured and matches present)
- Step summary (always)

## AI Prompt & Expected Model Output
The system prompt instructs the model to return ONLY a raw JSON array. Example expected content (model response):
```json
[
  { "issue": 123, "likelihood": "high", "reason": "Both describe auth timeout when token refresh fails." },
  { "issue": 145, "likelihood": "medium", "reason": "Similar stack trace segment in error output." }
]
```
Rules enforced:
- Array length ≤ 15.
- `likelihood` ∈ `high | medium | low`.
- Omit irrelevant issues; return `[]` if none.
- No markdown, code fences, or extra keys.

Responses failing validation (non-array, wrong fields, invalid likelihood) are ignored.

## Comment Format (Posted to Issue)
When matches exist and `post_comment: true`:
```
## ⚠️ Potential Duplicate/Semantically Similar Issues Identified
The following issues may be duplicates or semantically similar to the current issue. Please review them:

**Issue** #123: **high**
**Title:** Example auth timeout
**State:** open
**Reason:** Both describe token refresh failing during login.

**Issue** #145: **medium**
**Title:** Sporadic 401 errors
**State:** closed
**Reason:** Overlapping description of session expiration handling.
```

## Local Development
Prereqs: [Bun](https://bun.sh) (used for build) & Node 20 compatible environment.

Install deps & build:
```bash
bun install
bun run build   # lints, builds to dist/
```
Run directly (dev):
```bash
bun run start
```
Commit the compiled `dist/` directory when publishing a new version tag so the Action runner can execute it.

## Testing / Linting
```bash
bun test
bun run lint        # report
bun run lintFix     # auto-fix + report
```

## Permissions
Minimal recommended permissions block:
```yaml
permissions:
  issues: write
  contents: read
  models: read
```

## Limitations / Considerations
- Quality depends on the chosen model & prompt adherence.
- Large repos => more batches & latency.
- No deduplication of repeated model suggestions across batches (low chance but possible); can be added later.
- A malformed model response for one batch does not fail the entire run; it is skipped.
- Single token used for both GitHub REST & model endpoint; ensure scopes cover both.

## Roadmap Ideas
- Emit structured outputs (e.g., JSON of matches, boolean flag) via `$GITHUB_OUTPUT`.
- Advanced heuristic preprocessing (normalization, stopword removal, body length trimming).
- Duplicate suggestion deduplication across batches.
- Support PR duplicate detection.
- Retry / backoff for transient AI errors.

## Contributing
Pull requests welcome. Please keep code lint‑clean and commit updated `dist/` artifacts for release tags.

## License
MIT – see [LICENSE](LICENSE).

## Support
Open an issue for bugs, questions, or feature requests.
