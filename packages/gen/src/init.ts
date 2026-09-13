/**
 * `webview2-bridge-gen init`: 同梱テンプレート（template/myapp/ = リポジトリの templates/myapp/ のコピー）を
 * コピーし、プレースホルダ `MyApp` / `myapp` をアプリ名に置換して新規アプリの骨組みを書き出す。
 *
 * - `MyApp`（PascalCase）: VB の名前空間・プロジェクト名・アセンブリ名・Form のタイトル・LocalAppData のフォルダ名
 * - `myapp`（小文字）: package.json の name
 * - .sln のプロジェクト GUID は新しく振り直す（プロジェクト種別 GUID は変えない）
 * - `_gitignore` は `.gitignore` に戻す（npm pack が .gitignore を改名するため同梱時は別名）
 *
 * Node 固有（fs）なので index.ts からは export しない（generate と同じ entry）。
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GenerateError } from "./schema.js";

/** テンプレート内のプレースホルダ */
export const TEMPLATE_NAME = "MyApp";

export interface ScaffoldOptions {
  /** 書き出し先ディレクトリ（無ければ作る。既にファイルがあれば force なしではエラー） */
  targetDir: string;
  /** アプリ名（PascalCase 推奨。VB の名前空間になるので識別子として妥当なこと） */
  name: string;
  /** 既存ファイルがあっても上書きする */
  force?: boolean;
  /** テンプレートの場所（既定: パッケージ同梱の template/myapp/） */
  templateDir?: string;
}

export interface ScaffoldResult {
  /** 書き出したファイル（targetDir からの相対パス、"/" 区切り） */
  files: string[];
  /** 置換後のアプリ名 */
  name: string;
}

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** アプリ名として使えるか（VB の名前空間の 1 セグメントになる） */
export function validateAppName(name: string): void {
  if (!NAME_PATTERN.test(name)) {
    throw new GenerateError(
      `invalid app name "${name}": use letters, digits and underscores only, starting with a letter (e.g. InventoryApp)`,
    );
  }
  if (name === TEMPLATE_NAME) {
    throw new GenerateError(`app name "${TEMPLATE_NAME}" is the template placeholder; choose another name`);
  }
}

/** ディレクトリ名から既定のアプリ名を作る（inventory-app → InventoryApp） */
export function defaultAppName(dirName: string): string {
  const pascal = dirName
    .split(/[^A-Za-z0-9]+/)
    .filter((s) => s.length > 0)
    .map((s) => s[0]!.toUpperCase() + s.slice(1))
    .join("");
  return /^[0-9]/.test(pascal) ? `App${pascal}` : pascal;
}

/** 同梱テンプレートのディレクトリ（src/ からも dist/ からも ../template/myapp） */
export function bundledTemplateDir(): string {
  return fileURLToPath(new URL("../template/myapp/", import.meta.url));
}

/** テンプレートをコピーしてアプリ名に置換する */
export async function scaffold(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const { name } = options;
  validateAppName(name);
  const templateDir = options.templateDir ?? bundledTemplateDir();
  const targetDir = path.resolve(options.targetDir);

  const existing = await readdir(targetDir).catch(() => null);
  if (existing !== null && existing.length > 0 && !options.force) {
    throw new GenerateError(`${targetDir} is not empty (use --force to write into it anyway)`);
  }

  const rename = (s: string): string => s.replaceAll(TEMPLATE_NAME, name).replaceAll(TEMPLATE_NAME.toLowerCase(), name.toLowerCase());
  const files: string[] = [];
  for (const rel of await listFiles(templateDir)) {
    const outRel = rename(rel === "_gitignore" ? ".gitignore" : rel);
    let content = rename(await readFile(path.join(templateDir, rel), "utf8"));
    if (outRel.endsWith(".sln")) content = renewProjectGuids(content);
    const target = path.join(targetDir, ...outRel.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    files.push(outRel);
  }
  return { files, name };
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  };
  await walk(root);
  return out.sort();
}

/**
 * .sln の `Project("{種別GUID}") = "名前", "パス", "{プロジェクトGUID}"` からプロジェクト GUID を集め、
 * 新しい GUID に置き換える（ProjectConfigurationPlatforms 等の参照箇所も同じ置換で追従する）
 */
export function renewProjectGuids(sln: string): string {
  const projectLine = /^Project\("\{[0-9A-Fa-f-]+\}"\)\s*=\s*"[^"]*",\s*"[^"]*",\s*"\{([0-9A-Fa-f-]+)\}"/gm;
  let out = sln;
  for (const m of sln.matchAll(projectLine)) {
    const oldGuid = m[1]!;
    out = out.replaceAll(`{${oldGuid}}`, `{${randomUUID().toUpperCase()}}`);
  }
  return out;
}
