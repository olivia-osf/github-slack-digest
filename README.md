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
- Both OAuth flows use a `state` parameter (random UUID, stored in a
  short-lived httpOnly cookie and verified on callback) to prevent CSRF —
  without it, an attacker could trick the app into linking an account
  they control instead of the intended one.

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
- Note: classic GitHub OAuth Apps only support a single callback URL each
  (unlike Slack, which allows multiple redirect URLs on one app). If you
  want both local dev and a deployed instance working at once, register
  two separate GitHub OAuth Apps — one per callback URL — and use each
  one's Client ID/Secret in the matching environment's env vars. This repo
  does exactly that: one app for `localhost:3000`, one for the Vercel URL.

**Slack** — https://api.slack.com/apps → Create New App
- Add bot scopes: `chat:write`, `channels:read`, `groups:read`
- OAuth Redirect URL: `{URL}/api/auth/slack/callback` (add both your local
  and deployed URLs here — Slack apps support multiple redirect URLs)
- Install the app to your workspace, and invite the bot to whichever
  channel you want digests posted to (`/invite @YourAppName`)

## Live deployment

Deployed at: **https://github-slack-digest.vercel.app**

There are two ways to test it, depending on what you want to see:

**Option A — zero setup.** Hit the live endpoint directly with the channel
below, a real working channel ID in the already-connected Slack workspace:

```
GET https://github-slack-digest.vercel.app/api/webhook?repo=oven-sh/bun&channel=C0BM51MUZQU
```

- `channel` — `C0BM51MUZQU` (a real channel ID in the connected workspace,
  used in the example above)
- `repo` — can be swapped for any public GitHub repo with open issues, e.g.:
  - `oven-sh/bun`
  - `zammad/zammad`
  - `microsoft/vscode`

This uses my existing GitHub/Slack connections, so it works immediately
with no login required on your end. Happy to send an invite to that Slack
workspace on request if you'd like to see the message land visually — the
JSON response alone already confirms it posted (`slackMessageTs` is
Slack's own success confirmation for the post).

**Option B — prove the dynamic reconnection.** Visit the app root and click
**Reconnect GitHub** / **Reconnect Slack** to point it at your own GitHub
account and Slack workspace instead — this is the in-product flow described
above, and directly demonstrates connecting to a different Slack/GitHub
without a redeploy or config change. Note this replaces the current shared
connection (there's no per-user/tenant concept, per the brief), so Option A
won't work for anyone else until it's reconnected back.

Example response:

```json
{
  "status": 200,
  "ok": true,
  "repo": "oven-sh/bun",
  "label": null,
  "channel": "C0123456789",
  "issuesFound": 5,
  "issuesPosted": 5,
  "issues": [
    { "number": 36494, "title": "Example issue title", "url": "https://github.com/oven-sh/bun/issues/36494", "author": "someuser" }
  ],
  "slackMessageTs": "1785466767.018659",
  "triggeredAt": "2026-07-31T02:59:27.054Z"
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
