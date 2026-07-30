import { NextRequest, NextResponse } from "next/server";
import { getTokens } from "@/lib/tokenStore";
import { fetchOpenIssues, GithubApiError } from "@/lib/github";
import { postIssueDigest, SlackApiError } from "@/lib/slack";

/**
 * GET /api/webhook?repo=owner/name&channel=C0123456&label=bug
 *
 * Pulls open issues from the given GitHub repo (optionally filtered by
 * label) and posts a digest to the given Slack channel. Both connections
 * must already be authorized via /api/auth/github and /api/auth/slack.
 *
 * Params:
 *   repo     (required) "owner/name", e.g. "vercel/next.js"
 *   channel  (required) Slack channel ID or name the bot has access to
 *   label    (optional) filter issues to a specific GitHub label
 *
 * Returns JSON describing what was read and what action was taken, so the
 * response is legible on its own without needing to watch it run live.
 */
export async function GET(req: NextRequest) {
  const repo = req.nextUrl.searchParams.get("repo");
  const channel = req.nextUrl.searchParams.get("channel");
  const label = req.nextUrl.searchParams.get("label") ?? undefined;

  if (!repo || !channel) {
    return NextResponse.json(
      {
        error:
          "Missing required params. Usage: /api/webhook?repo=owner/name&channel=CHANNEL_ID[&label=bug]",
      },
      { status: 400 }
    );
  }

  const tokens = await getTokens();

  const missing: string[] = [];
  if (!tokens.github) missing.push("github");
  if (!tokens.slack) missing.push("slack");
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Not connected: ${missing.join(", ")}. Visit the app root and use the Connect buttons before hitting this endpoint.`,
        connectUrl: new URL(req.url).origin,
        missing,
      },
      { status: 409 }
    );
  }

  // Step 1: read from GitHub
  let issues;
  try {
    issues = await fetchOpenIssues(tokens.github!.access_token, repo, label);
  } catch (err) {
    if (err instanceof GithubApiError) {
      return NextResponse.json(
        {
          error: `GitHub read failed: ${err.message}`,
          step: "github_read",
          repo,
          label: label ?? null,
        },
        { status: err.status === 401 ? 401 : 502 }
      );
    }
    return NextResponse.json(
      { error: "Unexpected error reading from GitHub.", step: "github_read" },
      { status: 500 }
    );
  }

  // Step 2: write to Slack
  try {
    const posted = await postIssueDigest(
      tokens.slack!.access_token,
      channel,
      repo,
      issues
    );

    return NextResponse.json({
      ok: true,
      repo,
      label: label ?? null,
      channel,
      issuesFound: issues.length,
      issuesPosted: Math.min(issues.length, 10),
      issues: issues.slice(0, 10).map((i) => ({
        number: i.number,
        title: i.title,
        url: i.html_url,
        author: i.user.login,
      })),
      slackMessageTs: posted.ts,
      triggeredAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof SlackApiError) {
      return NextResponse.json(
        {
          error: `Slack post failed: ${err.message}`,
          step: "slack_write",
          issuesFoundButNotPosted: issues.length,
          hint: "Check the channel ID is correct and the Slack app/bot has been invited to it.",
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: "Unexpected error posting to Slack.", step: "slack_write" },
      { status: 500 }
    );
  }
}
