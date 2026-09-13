# create-webview2-bridge

Scaffold a **WinForms (VB.NET / .NET Framework 4.8) + WebView2 + Vite/React** app wired with
[webview2-bridge](https://github.com/ishibashi0112/webview2-bridge): one zod contract, generated TypeScript types and
VB.NET DTO / Interface / Dispatcher, and a JSON-RPC bridge over `postMessage`.

```sh
pnpm create webview2-bridge my-app --name MyInventory
# or: npm create webview2-bridge my-app -- --name MyInventory
# or: npx create-webview2-bridge my-app --name MyInventory

cd my-app
pnpm install
pnpm gen:check      # generated files match the bundled generator
pnpm dev            # http://localhost:5173 in a plain browser (mock transport)
```

On Windows, run the WinForms host against the dev server:

```bat
set WEBVIEW2_BRIDGE_DEV_URL=http://localhost:5173
dotnet run --project dotnet/MyInventory.Host
```

This is a thin alias for `webview2-bridge-gen init` from
[`@ishibashi0112/webview2-bridge-gen`](https://www.npmjs.com/package/@ishibashi0112/webview2-bridge-gen), which
documents the generator, the contract format and the VB.NET runtime. `--name` becomes the VB namespace and project
names (PascalCase; defaults to the directory name). The generated README walks through the dev loop and the Windows checks.

Requires Node.js 20.19+, pnpm (or npm) and, for the VB side, the .NET SDK 8+ and the WebView2 Runtime.

MIT
