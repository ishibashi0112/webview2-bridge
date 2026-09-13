// templates/myapp/（唯一の正）を packages/gen/template/myapp/ にコピーする。
// gen はこのコピーを npm に同梱し、`webview2-bridge-gen init` で新規アプリの骨組みとして書き出す。
// `pnpm build` の前に自動で走る。テスト（init.test.ts）がコピーと templates/ の同期を検証する。
//
// - node_modules / bin / obj / dist / pnpm-lock.yaml は含めない
// - `.gitignore` は npm pack が `.npmignore` に改名してしまうので `_gitignore` として同梱し、init が戻す
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const source = path.join(repoRoot, "templates/myapp");
const dest = path.resolve(here, "../template/myapp");

export const EXCLUDED_DIRS = new Set(["node_modules", "bin", "obj", "dist", ".vs"]);
export const EXCLUDED_FILES = new Set(["pnpm-lock.yaml"]);

/** テンプレート内のファイルを相対パスで列挙する（除外ルール適用済み、ソート済み） */
export function listTemplateFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!EXCLUDED_DIRS.has(e.name)) walk(path.join(dir, e.name));
      } else if (!EXCLUDED_FILES.has(e.name)) {
        out.push(path.relative(root, path.join(dir, e.name)).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** 同梱時のファイル名（.gitignore → _gitignore） */
export function bundledName(rel) {
  return rel === ".gitignore" ? "_gitignore" : rel;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  rmSync(dest, { recursive: true, force: true });
  const files = listTemplateFiles(source);
  for (const rel of files) {
    const to = path.join(dest, bundledName(rel));
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(path.join(source, rel), to);
  }
  console.log(`synced template: ${files.length} files -> ${path.relative(repoRoot, dest)}`);
}
