import { GithubIssue } from "./github";

export class SlackApiError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/**
 * Posts a formatted digest of issues to a Slack channel via chat.postMessage.
 * Requires the `chat:write` scope on the connected token.
 */
export async function postIssueDigest(
  accessToken: string,
  channel: string,
  repo: string,
  issues: GithubIssue[]
): Promise<{ ts: string }> {
  const text =
    issues.length === 0
      ? `No open issues found for *${repo}*.`
      : [
          `*Open issues for ${repo}* (${issues.length}):`,
          ...issues
            .slice(0, 10)
            .map((i) => `• <${i.html_url}|#${i.number} ${i.title}> — @${i.user.login}`),
        ].join("\n");

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel, text }),
  });

  const data = await res.json();

  if (!data.ok) {
    // Slack returns 200 with { ok: false, error: "..." } on failure —
    // it does not use HTTP status codes for API errors, so we have to
    // check the body explicitly.
    throw new SlackApiError(`Slack API error: ${data.error}`);
  }

  return { ts: data.ts };
}
