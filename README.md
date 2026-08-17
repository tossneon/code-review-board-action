# Code Review Board — GitHub Action

> **참고 (내부용):** 이 폴더는 모노레포 안의 원본/개발 사본이다. 정식 배포·GitHub Marketplace 등록은 별도 리포 [`tossneon/code-review-board-action`](https://github.com/tossneon/code-review-board-action)에서 이루어진다(`git subtree split -P code-review-board-action`으로 분리). 실제 사용자에게 안내할 `uses:` 참조는 이 모노레포 경로가 아니라 그 별도 리포를 기준으로 한다. 진행 상황: [`niche-templates/execution/products/10-code-review-board-action.md`](../niche-templates/execution/products/10-code-review-board-action.md).

> Your AI coding assistant already said "looks good!" That's exactly the problem.

Three independent AI reviewers — **Security Skeptic**, **Reliability Realist**, **Maintainability Pragmatist** — critique every pull request separately, without seeing each other's verdict first. No GitHub-connected SaaS subscription, no code stored anywhere. You bring your own Anthropic API key; the Action calls Claude directly and posts one combined review comment on the PR.

This is the GitHub Action edition of [Code Review Board](https://nadacompany.gumroad.com/l/code-review-board) (originally a Notion + prompt-pack product for pasting diffs into ChatGPT/Claude by hand) — same three personas, now wired into your PR pipeline automatically.

## Why

- **CodeRabbit / Greptile / Qodo** are excellent but are recurring SaaS subscriptions ($19–30/seat/mo) that connect to your repo.
- **Asking your own AI assistant "does this look okay?"** almost always gets you a agreeable "yes" — the same sycophancy problem the original Notion product was built to counter.
- This Action keeps the same anti-sycophancy design (three separate calls, three separate system prompts, explicit "don't default to agreement" instruction) but runs it automatically on every PR, using an API key **you** control — nothing is proxied through a third-party server, and no diff is stored anywhere after the run completes.

## Usage

```yaml
# .github/workflows/code-review-board.yml
name: Code Review Board
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: tossneon/code-review-board-action@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

That's it — on every PR push, you'll get one comment with three independent verdicts.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `anthropic-api-key` | ✅ | — | Your Anthropic (Claude) API key. Store it as a repo secret (`Settings → Secrets and variables → Actions`). |
| `github-token` | | `${{ github.token }}` | Token used to post the review comment. The default `GITHUB_TOKEN` works for public/private repos in the same repo. |
| `model` | | `claude-sonnet-4-5-20250929` | Claude model id to use. |
| `reviewers` | | `security,reliability,maintainability` | Comma-separated subset of personas to run. |
| `max-diff-chars` | | `60000` | Truncates the PR diff before sending it to the model — controls cost and context size on very large PRs. |
| `license-key` | | *(empty)* | Optional Code Review Board **Pro** license key. Unlocks a 4th persona (🚀 Performance Pessimist) and is meant to pair with a higher `max-diff-chars`. Free tier (3 reviewers) works fully without this. |
| `pro-product-id` | | *(empty)* | Gumroad `product_id` to verify `license-key` against — only needed if you set `license-key`. |

## What it actually sends

For each active persona, the Action sends one Anthropic API call containing: the PR title, PR description, and the PR diff (truncated to `max-diff-chars`). Nothing else leaves your workflow run — the Action doesn't call any server other than `api.anthropic.com` (for reviews) and, only if you set a Pro `license-key`, `api.gumroad.com` (to verify the key). No analytics, no telemetry, no third-party logging.

## Free vs. Pro

| | Free | Pro |
|---|---|---|
| Security Skeptic | ✅ | ✅ |
| Reliability Realist | ✅ | ✅ |
| Maintainability Pragmatist | ✅ | ✅ |
| 🚀 Performance Pessimist | — | ✅ |
| Suggested `max-diff-chars` | 60,000 | 120,000+ |

The free tier is not a trial — it's a fully working 3-reviewer setup with no time limit. Pro just adds a 4th lens and more headroom for large diffs.

## License

MIT — see [LICENSE](LICENSE). Runtime API usage (Anthropic, optionally Gumroad license verification) is billed to your own account; this Action itself is free and open source.
