'use strict';

const core = require('@actions/core');
const github = require('@actions/github');
const Anthropic = require('@anthropic-ai/sdk');

const { PERSONAS } = require('./personas');
const { verifyGumroadLicense } = require('./license');

const FREE_PERSONA_KEYS = Object.values(PERSONAS)
  .filter((p) => p.tier === 'free')
  .map((p) => p.key);

async function fetchDiff(octokit, owner, repo, pullNumber) {
  const res = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: { format: 'diff' },
  });
  // With format: 'diff', the SDK returns the raw diff text as `res.data`.
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
}

async function runPersona(anthropic, model, persona, prTitle, prBody, diff) {
  const userMessage = [
    `Pull request title: ${prTitle || '(no title)'}`,
    prBody ? `Pull request description:\n${prBody}` : null,
    '',
    'Diff to review:',
    '```diff',
    diff,
    '```',
  ]
    .filter((line) => line !== null)
    .join('\n');

  const response = await anthropic.messages.create({
    model,
    max_tokens: 700,
    system: persona.system,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return text || '_(no findings text returned)_';
}

function truncateDiff(diff, maxChars) {
  if (diff.length <= maxChars) return { diff, truncated: false };
  return {
    diff: diff.slice(0, maxChars) + '\n... (diff truncated for review — see the PR itself for the rest)',
    truncated: true,
  };
}

async function main() {
  const anthropicApiKey = core.getInput('anthropic-api-key', { required: true }) || process.env.ANTHROPIC_API_KEY;
  const githubToken = process.env.GITHUB_TOKEN;
  const model = process.env.CRB_MODEL || 'claude-sonnet-4-5-20250929';
  const requestedReviewers = (process.env.CRB_REVIEWERS || 'security,reliability,maintainability')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const maxDiffChars = parseInt(process.env.CRB_MAX_DIFF_CHARS || '60000', 10);
  const licenseKey = process.env.CRB_LICENSE_KEY || '';
  const proProductId = process.env.CRB_PRO_PRODUCT_ID || '';

  const context = github.context;
  const pr = context.payload.pull_request;
  if (!pr) {
    core.warning('Code Review Board: this run has no pull_request in the event payload — skipping. ' +
      'Trigger this action on pull_request / pull_request_target events.');
    return;
  }

  const octokit = github.getOctokit(githubToken);
  const { owner, repo } = context.repo;

  core.info(`Code Review Board: reviewing PR #${pr.number} in ${owner}/${repo}`);

  const rawDiff = await fetchDiff(octokit, owner, repo, pr.number);
  const { diff, truncated } = truncateDiff(rawDiff, maxDiffChars);

  let isPro = false;
  if (licenseKey && proProductId) {
    isPro = await verifyGumroadLicense(proProductId, licenseKey);
    core.info(`Code Review Board: Pro license ${isPro ? 'verified ✅' : 'could not be verified — falling back to free tier'}`);
  }

  const allowedKeys = new Set(isPro ? Object.keys(PERSONAS) : FREE_PERSONA_KEYS);
  const activeKeys = requestedReviewers.filter((k) => PERSONAS[k]);
  const skippedPro = requestedReviewers.filter((k) => PERSONAS[k] && !allowedKeys.has(k));
  const runKeys = activeKeys.filter((k) => allowedKeys.has(k));

  if (runKeys.length === 0) {
    core.setFailed('Code Review Board: no valid reviewers to run (check the `reviewers` input).');
    return;
  }

  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const results = await Promise.allSettled(
    runKeys.map((key) => runPersona(anthropic, model, PERSONAS[key], pr.title, pr.body, diff)),
  );

  const sections = results.map((result, i) => {
    const persona = PERSONAS[runKeys[i]];
    if (result.status === 'fulfilled') {
      return `### ${persona.label}\n\n${result.value}`;
    }
    core.warning(`Code Review Board: ${persona.key} reviewer failed: ${result.reason}`);
    return `### ${persona.label}\n\n_Review failed to complete this run — see the Action log for details._`;
  });

  const anyOk = results.some((r) => r.status === 'fulfilled');
  if (!anyOk) {
    core.setFailed('Code Review Board: every reviewer failed — check your ANTHROPIC_API_KEY and Action log.');
    return;
  }

  let footer = '\n---\n_🔍 [Code Review Board](https://nadacompany.gumroad.com/l/code-review-board) — three independent AI reviewers, no code stored, nothing sent anywhere except the Anthropic API key you provided.';
  if (truncated) footer += ' Diff was truncated for this review — see the PR for the full change.';
  if (skippedPro.length > 0) {
    footer += ` Skipped Pro-only reviewer(s) (${skippedPro.join(', ')}) — add \`license-key\`/\`pro-product-id\` to unlock.`;
  }
  footer += '_';

  const body = [
    '## 🔍 Code Review Board',
    'Three independent AI reviewers, each blind to the others\' verdict:',
    '',
    sections.join('\n\n'),
    footer,
  ].join('\n');

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: pr.number,
    body,
  });

  core.info('Code Review Board: review comment posted.');
}

main().catch((err) => {
  core.setFailed(`Code Review Board failed: ${err.message}`);
});
