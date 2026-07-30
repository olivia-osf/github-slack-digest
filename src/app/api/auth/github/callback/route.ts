import { NextRequest, NextResponse } from "next/server";
import { setTokens } from "@/lib/tokenStore";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const origin = new URL(req.url).origin;

  const expectedState = req.cookies.get("github_oauth_state")?.value;
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${origin}/?error=github_state_mismatch`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=github_no_code`);
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/?error=github_not_configured`);
  }

  const tokenRes = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${origin}/api/auth/github/callback`,
      }),
    }
  );

  const data = await tokenRes.json();

  if (!data.access_token) {
    return NextResponse.redirect(
      `${origin}/?error=github_token_exchange_failed`
    );
  }

  await setTokens({
    github: {
      access_token: data.access_token,
      scope: data.scope,
      connected_at: new Date().toISOString(),
    },
  });

  const res = NextResponse.redirect(`${origin}/?connected=github`);
  res.cookies.delete("github_oauth_state");
  return res;
}
