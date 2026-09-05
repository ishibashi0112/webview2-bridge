# @ishibashi0112/webview2-bridge-client

Front-end runtime for [webview2-bridge](https://github.com/ishibashi0112/webview2-bridge): a typed JSON-RPC 2.0 client that
talks to a VB.NET WinForms host through WebView2 `postMessage`, validated on both ends with the zod contract you wrote for
[`@ishibashi0112/webview2-bridge-gen`](https://www.npmjs.com/package/@ishibashi0112/webview2-bridge-gen).

```sh
pnpm add @ishibashi0112/webview2-bridge-client zod
```

## Usage

```ts
import { createClient, MemoryTransport, selectTransport } from "@ishibashi0112/webview2-bridge-client";
import { contract, type Contract } from "@webview2-bridge/contract"; // your zod contract
import { handlers } from "./mock/handlers";                            // MemoryHandlers<Contract>

// WebView2 present → WebView2Transport; otherwise the mode from VITE_TRANSPORT (default "memory")
const { mode, transport } = selectTransport({
  mode: import.meta.env.VITE_TRANSPORT,
  factories: { memory: () => new MemoryTransport<Contract>(handlers, { delay: 100 }) },
});

export const client = createClient(contract, transport);

const res = await client.parts.search({ keyword: "M6" }); // typed: { items: Part[] }
const off = client.events.on("progress", (p) => console.log(p.percent)); // host → web notifications
```

- **Input** is validated with zod before sending; **output** and **event payloads** after receiving.
  Mismatches reject with `BridgeValidationError` (`direction`, `method`, `issues`).
- Host errors arrive as `BridgeError` with the JSON-RPC `code` / `message` / `data`
  (`-32000` + exception type name for unhandled VB exceptions, or the code of a `JsonRpcException`).
- `BridgeTimeoutError` after `timeoutMs` (default 30 s); `BridgeDisposedError` when the transport was disposed.

## Transports

| Transport | Use |
|---|---|
| `WebView2Transport` | inside the WinForms host (`window.chrome.webview`). Wire format: JSON-RPC 2.0 over `postMessage` / `PostWebMessageAsJson` |
| `MemoryTransport<C>(handlers, { delay })` | plain browser / tests. Handlers are typed from the contract: `{ parts: { search: async (input, { emit }) => output } }`; `emit("progress", payload)` simulates host events. Handler exceptions become `-32000` errors like on the VB side |
| your own | implement `Transport { call(method, params); on(method, handler) }` (e.g. msw / http) and add it to `selectTransport` factories |

Protocol details and the VB.NET side (`WebView2Bridge.Runtime`, `WebView2Bridge.WinForms` on NuGet) are documented in the repository.

MIT
