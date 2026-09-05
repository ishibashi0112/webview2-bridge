import { BridgeError, BridgeTimeoutError, BridgeValidationError } from "@wvbridge/client";
import { useEffect, useState, type FormEvent } from "react";
import { client, transportKind } from "./bridge";
import type { PartsSearchOutput, ProgressEvent } from "./generated/contract-types";

type Part = PartsSearchOutput["items"][number];

function describeError(err: unknown): string {
  if (err instanceof BridgeValidationError) return `契約違反 (${err.direction}): ${err.message}`;
  if (err instanceof BridgeTimeoutError) return `タイムアウト: ${err.message}`;
  if (err instanceof BridgeError) return `ホストエラー ${err.code}: ${err.message}${err.data ? ` (${String(err.data)})` : ""}`;
  return err instanceof Error ? err.message : String(err);
}

export function App() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Part[] | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => client.events.on("progress", setProgress), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      const res = await client.parts.search({ keyword });
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
      <header className="app__header">
        <h1>wvbridge</h1>
        <span className={`badge badge--${transportKind}`} title="使用中の Transport">
          {transportKind}
        </span>
      </header>

      <form className="search" onSubmit={onSubmit}>
        <input
          className="search__input"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="部品番号または名称（空は契約違反、error はホストエラーの例）"
          autoFocus
        />
        <button className="search__button" type="submit" disabled={busy}>
          {busy ? "検索中…" : "検索"}
        </button>
      </form>

      <section className="status" aria-live="polite">
        {progress && (
          <div className="progress">
            <progress max={100} value={progress.percent} />
            <span>
              {progress.percent}%{progress.message ? ` — ${progress.message}` : ""}
            </span>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {items && (
        <table className="results">
          <thead>
            <tr>
              <th>部品番号</th>
              <th>名称</th>
              <th className="num">数量</th>
              <th>更新日時</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  該当なし
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.partNo}>
                <td>{p.partNo}</td>
                <td>{p.name}</td>
                <td className="num">{p.qty.toLocaleString()}</td>
                <td>{p.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
