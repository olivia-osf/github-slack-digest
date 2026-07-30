import { NextRequest, NextResponse } from "next/server";
import { setTokens } from "@/lib/tokenStore";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const origin = new URL(req.url).origin;

  const expectedState = req.cookies.get("slack_oauth_state")?.value;
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${origin}/?error=slack_state_mismatch`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=slack_no_code`);
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?error=slack_not_configured`);
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: `${origin}/api/auth/slack/callback`,
  });

  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await tokenRes.json();

  if (!data.ok) {
    return NextResponse.redirect(
      `${origin}/?error=slack_token_exchange_failed`
    );
  }

  await setTokens({
    slack: {
      access_token: data.access_token,
      team_name: data.team?.name,
      scope: data.scope,
      connected_at: new Date().toISOString(),
    },
  });

  const res = NextResponse.redirect(`${origin}/?connected=slack`);
  res.cookies.delete("slack_oauth_state");
  return res;
}
