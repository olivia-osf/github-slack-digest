import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "SLACK_CLIENT_ID is not configured on the server." },
      { status: 500 }
    );
  }

  const state = randomUUID();
  const redirectUri = `${new URL(req.url).origin}/api/auth/slack/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "chat:write,channels:read,groups:read",
    user_scope: "",
    state,
  });

  const res = NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`
  );
  // CSRF protection: verified against the `state` query param on callback.
  res.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
