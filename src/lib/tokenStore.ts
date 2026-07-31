/**
 * Token storage abstraction.
 *
 * Why this exists: the take-home requires connections to be made dynamically
 * via an in-product OAuth flow, with no redeploy needed to add/change a
 * connection. That means tokens can't live in env vars or static config —
 * they need to persist somewhere that survives serverless cold starts and
 * redeploys.
 *
 * - In production: reads/writes via the Vercel KV / Upstash Redis REST API
 *   (set KV_REST_API_URL + KV_REST_API_TOKEN — Vercel provisions these
 *   automatically if you attach a KV store to the project).
 * - In local dev: falls back to a JSON file on disk so you don't need a KV
 *   store just to run `npm run dev`.
 *
 * This app has no user/tenant concept (per the brief), so there is exactly
 * one "slot" per connected system: one GitHub connection, one Slack
 * connection, shared globally.
 */

import { promises as fs } from "fs";
import path from "path";

export type StoredTokens = {
  github?: {
    access_token: string;
    connected_at: string;
    scope?: string;
  };
  slack?: {
    access_token: string;
    team_name?: string;
    connected_at: string;
    scope?: string;
  };
};

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const STORE_KEY = "integration_tokens";
const LOCAL_FILE = path.join(process.cwd(), ".local-token-store.json");

async function kvGet(): Promise<StoredTokens> {
  const res = await fetch(`${KV_URL}/get/${STORE_KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) return {};
  const data = await res.json();
  if (!data?.result) return {};
  try {
    return JSON.parse(data.result);
  } catch {
    return {};
  }
}

async function kvSet(tokens: StoredTokens): Promise<void> {
  await fetch(`${KV_URL}/set/${STORE_KEY}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(tokens),
  });
}

async function fileGet(): Promise<StoredTokens> {
  try {
    const raw = await fs.readFile(LOCAL_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function fileSet(tokens: StoredTokens): Promise<void> {
  await fs.writeFile(LOCAL_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

const usingKv = Boolean(KV_URL && KV_TOKEN);

export async function getTokens(): Promise<StoredTokens> {
  return usingKv ? kvGet() : fileGet();
}

export async function setTokens(update: Partial<StoredTokens>): Promise<void> {
  const current = await getTokens();
  const merged = { ...current, ...update };
  await (usingKv ? kvSet(merged) : fileSet(merged));
}

export function storageBackend(): "kv" | "local-file" {
  return usingKv ? "kv" : "local-file";
}
