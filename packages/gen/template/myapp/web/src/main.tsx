import { errorField, isUserFacingError } from "@ishibashi0112/webview2-bridge-client";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { client, transportMode } from "./bridge";
import type { Customer } from "./generated/contract-types";

// 操作・確認する要素には data-testid="<画面>-<役割>" を付ける(自動テスト e2e/ が要素を指すため。文言や CSS では選ばない)
function App() {
  const [keyword, setKeyword] = useState("");
  const [items, setItems] = useState<Customer[]>([]);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keywordError, setKeywordError] = useState<string | null>(null);

  // Host → Web のイベント（VB の BridgeEvents.Progress）
  useEffect(() => client.events.on("progress", (p) => setPercent(p.percent)), []);

  const search = async () => {
    setError(null);
    setKeywordError(null);
    try {
      const res = await client.customers.list({ keyword: keyword || undefined });
      setItems(res.items);
    } catch (e) {
      // 利用者向けエラー（VB の JsonRpcException.Business、-32010）は message をそのまま見せる。
      // field（要求の JSON 名）があればその入力欄の下、無ければ画面のエラー欄。それ以外は開発者向けの文字列
      if (isUserFacingError(e) && errorField(e) === "keyword") setKeywordError(e.message);
      else if (isUserFacingError(e)) setError(e.message);
      else setError(String(e));
    }
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 16 }}>
      <p>transport: <b data-testid="transport-badge">{transportMode}</b></p>
      <input data-testid="customers-keyword" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="keyword" />
      {keywordError && <span data-testid="customers-keyword-error" style={{ color: "red", marginLeft: 8 }}>{keywordError}</span>}
      <button data-testid="customers-search" onClick={search}>customers.list</button>
      {percent !== null && <span data-testid="customers-progress" style={{ marginLeft: 8 }}>{percent}%</span>}
      {error && <p data-testid="customers-error" style={{ color: "red" }}>{error}</p>}
      <ul data-testid="customers-list">{items.map((c) => <li key={c.id} data-testid="customers-item">{c.id}: {c.name}</li>)}</ul>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
