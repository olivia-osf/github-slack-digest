export type GithubIssue = {
  number: number;
  title: string;
  html_url: string;
  user: { login: string };
  labels: { name: string }[];
  created_at: string;
};

export class GithubApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Fetch open issues for a repo, optionally filtered by label.
 * Handles rate limiting and auth failures gracefully — callers should
 * catch GithubApiError and surface a clean message rather than a 500.
 */
export async function fetchOpenIssues(
  accessToken: string,
  repo: string,
  label?: string
): Promise<GithubIssue[]> {
  const params = new URLSearchParams({ state: "open", per_page: "20" });
  if (label) params.set("labels", label);

  const res = await fetch(
    `https://api.github.com/repos/${repo}/issues?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (res.status === 403 || res.status === 429) {
    const resetHeader = res.headers.get("x-ratelimit-reset");
    throw new GithubApiError(
      `GitHub rate limit hit${
        resetHeader
          ? ` — resets at ${new Date(Number(resetHeader) * 1000).toISOString()}`
          : ""
      }`,
      429
    );
  }
  if (res.status === 401) {
    throw new GithubApiError(
      "GitHub token is invalid or expired — reconnect GitHub.",
      401
    );
  }
  if (res.status === 404) {
    throw new GithubApiError(
      `Repo "${repo}" not found or not accessible with this token.`,
      404
    );
  }
  if (!res.ok) {
    throw new GithubApiError(`GitHub API error (${res.status})`, res.status);
  }

  const data = await res.json();
  // GitHub's issues endpoint also returns PRs; filter those out.
  return (data as any[]).filter((item) => !item.pull_request);
}
