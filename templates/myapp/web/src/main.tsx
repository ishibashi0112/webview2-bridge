import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { client, transportMode } from "./bridge";
import type { Customer } from "./generated/contract-types";

function App() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Customer[]>([]);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Host → Web のイベント（VB の BridgeEvents.Progress）
  useEffect(() => client.events.on("progress", (p) => setPercent(p.percent)), []);

  const search = async () => {
    setError(null);
    try {
      const res = await client.customers.list({ keyword: keyword || undefined });
      setItems(res.items);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16 }}>
      <p>transport: <b>{transportMode}</b></p>
      <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="keyword" />
      <button onClick={search}>customers.list</button>
      {percent !== null && <span style={{ marginLeft: 8 }}>{percent}%</span>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <ul>{items.map((c) => <li key={c.id}>{c.id}: {c.name}</li>)}</ul>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
