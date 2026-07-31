import { NextResponse } from "next/server";
import { getTokens, storageBackend } from "@/lib/tokenStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const tokens = await getTokens();
  return NextResponse.json({
    github: {
      connected: Boolean(tokens.github),
      connectedAt: tokens.github?.connected_at ?? null,
      scope: tokens.github?.scope ?? null,
    },
    slack: {
      connected: Boolean(tokens.slack),
      connectedAt: tokens.slack?.connected_at ?? null,
      team: tokens.slack?.team_name ?? null,
      scope: tokens.slack?.scope ?? null,
    },
    storageBackend: storageBackend(),
  });
}
