# GitHub → Slack Issue Digest

Connects GitHub and Slack via OAuth and exposes a webhook that reads open
issues from a GitHub repo and posts a formatted digest to a Slack channel.

## What it does

- **Connect flow** (`/`): click-to-connect buttons for GitHub and Slack.
  Both use standard OAuth 2.0 — no static tokens, no redeploy needed to
  connect a different GitHub account or Slack workspace.
- **Webhook** (`GET /api/webhook`): reads open issues from a given repo
  (optionally filtered by label), posts a digest to a given Slack channel,
  and returns JSON describing what was read and what was posted.
- **Status** (`GET /api/status`): reports what's currently connected.

## How it's built

- Next.js 16 (App Router) + TypeScript, deployed on Vercel.
- Token storage is abstracted (`src/lib/tokenStore.ts`): uses Vercel KV /
  Upstash Redis via REST API in production, falls back to a local JSON file
  for `npm run dev`. This is what lets connections persist across
  serverless cold starts without living in env vars.
- No user/tenant model, per the brief — there's exactly one global
  connection slot per system (one GitHub token, one Slack token, shared).

## Running locally

```bash
npm install
cp .env.example .env.local
# fill in GITHUB_CLIENT_ID / SECRET and SLACK_CLIENT_ID / SECRET
npm run dev
```

Open `http://localhost:3000`, click **Connect GitHub** and **Connect
Slack**, then either use the on-page form or hit the endpoint directly:

```bash
curl "http://localhost:3000/api/webhook?repo=owner/name&channel=C0123456789&label=bug"
```

### Setting up the OAuth apps

**GitHub** — https://github.com/settings/developers → New OAuth App
- Homepage URL: your deployed URL (or `http://localhost:3000` for local-only testing)
- Authorization callback URL: `{URL}/api/auth/github/callback`

**Slack** — https://api.slack.com/apps → Create New App
- Add bot scopes: `chat:write`, `channels:read`, `groups:read`
- OAuth Redirect URL: `{URL}/api/auth/slack/callback`
- Install the app to your workspace, and invite the bot to whichever
  channel you want digests posted to (`/invite @YourAppName`)

## Live deployment

Deployed at: **`{FILL IN AFTER DEPLOY — e.g. https://github-slack-digest.vercel.app}`**

Hit the live endpoint directly:

```
GET https://{your-app}.vercel.app/api/webhook?repo=vercel/next.js&channel=C0123456789
```

Example response:

```json
{
  "ok": true,
  "repo": "vercel/next.js",
  "label": null,
  "channel": "C0123456789",
  "issuesFound": 8,
  "issuesPosted": 8,
  "issues": [
    { "number": 1234, "title": "Example issue", "url": "https://github.com/...", "author": "someuser" }
  ],
  "slackMessageTs": "1234567890.123456",
  "triggeredAt": "2026-07-30T05:00:00.000Z"
}
```

If GitHub or Slack isn't connected yet, the endpoint returns `409` with a
`connectUrl` pointing back at the app root rather than a bare error, so it's
recoverable without redeploying or contacting me.

## Error handling

- **GitHub rate limit / 403** → returns `429` with a clear message and,
  when available, the rate-limit reset time.
- **Invalid/expired GitHub token** → returns `401` with a reconnect hint.
- **Repo not found / inaccessible** → returns `404`-equivalent JSON error.
- **Slack post failure** (bad channel, bot not invited, etc.) → Slack
  returns `200` with `{ok: false}` rather than an HTTP error, so this is
  explicitly checked and surfaced as a `502` with the underlying Slack
  error code, while still reporting how many issues were found even though
  the post failed.
- **Missing/not-yet-connected integrations** → `409` with which system(s)
  are missing and a link to connect them, rather than a generic 500.

## Assumptions

- No user/tenant/org concept — one global connection per system, as
  specified in the brief.
- "Trigger action across connected systems" is interpreted as: read from
  GitHub, write to Slack, in a single request/response cycle (rather than
  an async job queue), since the brief asks the endpoint to "return some
  data appropriate to the workflow" synchronously.
- Token refresh: GitHub OAuth App tokens (as opposed to GitHub App
  installation tokens) don't expire by default, so no refresh flow was
  needed there. Slack bot tokens likewise don't expire unless the app is
  reinstalled or uninstalled.
- Channel is passed as a Slack channel ID rather than a name, since IDs are
  unambiguous and don't require an extra lookup call.
