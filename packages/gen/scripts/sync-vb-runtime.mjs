// dotnet/ にある VB ランタイムのソース（唯一の正）を packages/gen/vb-runtime/ にコピーする。
// gen はこのコピーを npm に同梱し、`vb.runtime` / `vb.winforms` の設定でアプリへ書き出す。
// `pnpm build` の前に自動で走る。テスト（vb-runtime.test.ts）がコピーと dotnet/ の同期を検証する。
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const dest = path.resolve(here, "../vb-runtime");

export const VB_RUNTIME_SOURCES = {
  runtime: { dir: "dotnet/WebView2Bridge.Runtime", files: ["JsonRpc.vb", "Dispatcher.vb", "IBridgeEmitter.vb"] },
  winforms: { dir: "dotnet/WebView2Bridge.WinForms", files: ["WebViewBridge.vb"] },
};

for (const [kind, src] of Object.entries(VB_RUNTIME_SOURCES)) {
  const outDir = path.join(dest, kind);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const f of src.files) {
    copyFileSync(path.join(repoRoot, src.dir, f), path.join(outDir, f));
  }
  console.log(`synced ${kind}: ${readdirSync(outDir).join(", ")}`);
}
