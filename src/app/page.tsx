"use client";

import { useEffect, useState } from "react";

type Status = {
  github: { connected: boolean; connectedAt: string | null; scope: string | null };
  slack: { connected: boolean; connectedAt: string | null; team: string | null; scope: string | null };
  storageBackend: string;
};

export default function Home() {
  const [status, setStatus] = useState<Status | null>(null);
  const [repo, setRepo] = useState("");
  const [channel, setChannel] = useState("");
  const [label, setLabel] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const refreshStatus = () => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const runWebhook = async () => {
    setLoading(true);
    setResult(null);
    const params = new URLSearchParams({ repo, channel });
    if (label) params.set("label", label);
    try {
      const res = await fetch(`/api/webhook?${params.toString()}`);
      const data = await res.json();
      setResult({ status: res.status, ...data });
    } catch (e) {
      setResult({ error: "Request failed to send." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-bold mb-1">GitHub → Slack Issue Digest</h1>
      <p className="text-gray-600 mb-6">
        Connect both systems below, then trigger a digest of open GitHub
        issues to a Slack channel.
      </p>

      <section className="mb-8 border rounded-lg p-4">
        <h2 className="font-semibold mb-3">1. Connections</h2>
        <div className="flex items-center justify-between mb-2">
          <span>
            GitHub —{" "}
            {status?.github.connected ? (
              <span className="text-green-600">
                connected{status.github.connectedAt ? ` (${new Date(status.github.connectedAt).toLocaleString()})` : ""}
              </span>
            ) : (
              <span className="text-gray-500">not connected</span>
            )}
          </span>
          <a
            href="/api/auth/github"
            className="px-3 py-1 rounded bg-black text-white text-sm"
          >
            {status?.github.connected ? "Reconnect" : "Connect"} GitHub
          </a>
        </div>
        <div className="flex items-center justify-between">
          <span>
            Slack —{" "}
            {status?.slack.connected ? (
              <span className="text-green-600">
                connected{status.slack.team ? ` to ${status.slack.team}` : ""}
              </span>
            ) : (
              <span className="text-gray-500">not connected</span>
            )}
          </span>
          <a
            href="/api/auth/slack"
            className="px-3 py-1 rounded bg-[#4A154B] text-white text-sm"
          >
            {status?.slack.connected ? "Reconnect" : "Connect"} Slack
          </a>
        </div>
        <button
          onClick={refreshStatus}
          className="text-xs text-gray-500 underline mt-3"
        >
          Refresh status
        </button>
      </section>

      <section className="mb-8 border rounded-lg p-4">
        <h2 className="font-semibold mb-3">2. Trigger the webhook</h2>
        <div className="flex flex-col gap-2 mb-3">
          <input
            className="border rounded px-2 py-1"
            placeholder="owner/repo, e.g. vercel/next.js"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
          />
          <input
            className="border rounded px-2 py-1"
            placeholder="Slack channel ID, e.g. C0123456789"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          />
          <input
            className="border rounded px-2 py-1"
            placeholder="Label filter (optional), e.g. bug"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <button
          onClick={runWebhook}
          disabled={loading || !repo || !channel}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-40"
        >
          {loading ? "Running…" : "Run digest"}
        </button>
        <p className="text-xs text-gray-500 mt-2">
          Equivalent to: <code>GET /api/webhook?repo={repo || "owner/name"}&channel={channel || "CHANNEL_ID"}{label ? `&label=${label}` : ""}</code>
        </p>
      </section>

      {result && (
        <section className="border rounded-lg p-4">
          <h2 className="font-semibold mb-2">Response</h2>
          <pre className="bg-gray-100 rounded p-3 text-xs overflow-x-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
