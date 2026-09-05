import { BridgeError, BridgeValidationError } from "@ishibashi0112/webview2-bridge-client";
import { useEffect, useState, type FormEvent } from "react";
import { client, transportMode } from "./bridge";
import type { Part, ProgressEvent } from "./generated/contract-types";

interface ErrorInfo {
  kind: string;
  message: string;
  detail?: string | undefined;
}

function describeError(e: unknown): ErrorInfo {
  if (e instanceof BridgeValidationError) {
    return { kind: `validation (${e.direction})`, message: e.message, detail: JSON.stringify(e.issues, null, 2) };
  }
  if (e instanceof BridgeError) {
    return { kind: `${e.name} ${e.code}`, message: e.message, detail: e.data === undefined ? undefined : JSON.stringify(e.data) };
  }
  return { kind: "error", message: e instanceof Error ? e.message : String(e) };
}

export function App() {
  const [keyword, setKeyword] = useState("m6");
  const [limit, setLimit] = useState("");
  const [items, setItems] = useState<Part[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // Host → Web イベント（event.progress）の購読。アンマウント時に解除
  useEffect(() => {
    return client.events.on("progress", (p) => {
      setProgress(p);
      setLog((prev) => [`${new Date().toLocaleTimeString()} progress ${p.percent}% ${p.message ?? ""}`, ...prev].slice(0, 20));
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const res = await client.parts.search({
        keyword,
        ...(limit.trim() !== "" && { limit: Number(limit) }),
      });
      setItems(res.items);
    } catch (err) {
      setItems(null);
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header>
        <h1>webview2-bridge</h1>
        <span className={`badge badge-${transportMode}`}>transport: {transportMode}</span>
      </header>

      <form onSubmit={(e) => void onSubmit(e)} className="search">
        <label>
          keyword
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder='空にすると入力検証エラー、"error" でホスト例外' />
        </label>
        <label>
          limit
          <input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" style={{ width: "5em" }} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "検索中…" : "parts.search"}
        </button>
      </form>

      {progress && (
        <div className="progress">
          <progress value={progress.percent} max={100} /> {progress.percent}% {progress.message}
        </div>
      )}

      {error && (
        <div className="error">
          <strong>{error.kind}</strong>: {error.message}
          {error.detail && <pre>{error.detail}</pre>}
        </div>
      )}

      {items && (
        <table>
          <thead>
            <tr>
              <th>partNo</th>
              <th>name</th>
              <th>qty</th>
              <th>updatedAt</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4}>該当なし</td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.partNo}>
                <td>{p.partNo}</td>
                <td>{p.name}</td>
                <td className="num">{p.qty}</td>
                <td>{p.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="log">
        <h2>events</h2>
        {log.length === 0 ? <p className="muted">（まだ受信なし）</p> : <ul>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      </section>
    </main>
  );
}
