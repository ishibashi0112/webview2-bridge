/**
 * Playwright のカスタムレポータ。結果を AI(M365 Copilot / Claude Code)に貼れる Markdown 1 枚にまとめ、
 * 失敗があればクリップボードにもコピーする(petari の失敗レポートと同じ体験)。
 *
 *   reporter: [["list"], ["@ishibashi0112/webview2-bridge-test/reporter", { file, clipboard, maxChars }]]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import { writeClipboard } from "./clipboard.js";
import type { ReportConfig } from "./config.js";

export interface ReportAttachment {
  name: string;
  contentType: string;
  path?: string | undefined;
  text?: string | undefined;
}

export interface ReportTestEntry {
  project: string;
  title: string;
  file: string;
  line: number;
  status: TestResult["status"];
  expectedStatus: TestCase["expectedStatus"];
  durationMs: number;
  errors: string[];
  attachments: ReportAttachment[];
}

export interface ReportInput {
  startedAt: Date;
  finishedAt: Date;
  status: FullResult["status"];
  tests: ReportTestEntry[];
  /** 出力ディレクトリの基準(添付のパスを相対にする) */
  rootDir: string;
}

const DEFAULT_FILE = "test-results/report.md";
const DEFAULT_MAX_CHARS = 120_000;
/** テキスト添付 1 件あたりの上限文字数(error-context 等) */
const MAX_TEXT_ATTACHMENT = 6_000;

// biome-ignore lint: 制御文字を消すための意図的な正規表現
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

function fmtTime(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function rel(rootDir: string, file: string): string {
  const r = path.relative(rootDir, file);
  return (r === "" || r.startsWith("..") ? file : r).split(path.sep).join("/");
}

function fence(body: string, lang = ""): string {
  // 本文に ``` が含まれても壊れないよう、より長いフェンスを使う
  let ticks = "```";
  while (body.includes(ticks)) ticks += "`";
  return `${ticks}${lang}\n${body.replace(/\n$/, "")}\n${ticks}`;
}

function isFailed(t: ReportTestEntry): boolean {
  return t.status !== "skipped" && t.status !== t.expectedStatus;
}

function summarizeDbDiffText(text: string): string | undefined {
  try {
    const diff = JSON.parse(text) as Record<string, { inserted?: unknown[]; updated?: unknown[]; deleted?: unknown[] }>;
    return Object.entries(diff)
      .map(([table, d]) => `${table}: inserted ${d.inserted?.length ?? 0} / updated ${d.updated?.length ?? 0} / deleted ${d.deleted?.length ?? 0}`)
      .join(", ");
  } catch {
    return undefined;
  }
}

/** Markdown を組み立てる純粋関数(テスト可能) */
export function buildReport(input: ReportInput, maxChars: number = DEFAULT_MAX_CHARS): string {
  const failed = input.tests.filter(isFailed);
  const passed = input.tests.filter((t) => !isFailed(t) && t.status !== "skipped");
  const skipped = input.tests.filter((t) => t.status === "skipped");
  const lines: string[] = [];
  lines.push(`# 自動テスト結果 (${fmtTime(input.finishedAt)})`);
  lines.push("");
  lines.push(`- 結果: **${failed.length === 0 ? "全件成功" : `失敗 ${failed.length} 件`}** (合計 ${input.tests.length} / 成功 ${passed.length} / 失敗 ${failed.length} / スキップ ${skipped.length})`);
  lines.push(`- 所要: ${Math.round((input.finishedAt.getTime() - input.startedAt.getTime()) / 1000)} 秒`);
  const projects = [...new Set(input.tests.map((t) => t.project))];
  lines.push(`- 層: ${projects.length > 0 ? projects.join(", ") : "(なし)"}`);
  lines.push("");

  if (failed.length > 0) {
    lines.push(`## 失敗 (${failed.length})`);
    lines.push("");
    lines.push("各項目の「期待」はテストコードが仕様書・設計書から読み取った振る舞い、「実際」は今のコードの振る舞いです。");
    lines.push("実装が仕様と違うなら実装を直し、テストの読み取りが誤っているならテストを直してください。どちらか判断できない場合は質問してください。");
    lines.push("");
    failed.forEach((t, i) => {
      lines.push(`### ${i + 1}. [${t.project}] ${t.title}`);
      lines.push("");
      lines.push(`- 場所: \`${rel(input.rootDir, t.file)}:${t.line}\``);
      lines.push(`- 状態: ${t.status} (${Math.round(t.durationMs / 1000)} 秒)`);
      for (const err of t.errors) {
        lines.push("");
        lines.push(fence(stripAnsi(err), "text"));
      }
      for (const a of t.attachments) {
        if (a.name === "screenshot" || a.contentType.startsWith("image/")) {
          if (a.path !== undefined) lines.push(`- スクリーンショット: \`${rel(input.rootDir, a.path)}\``);
          continue;
        }
        if (a.name === "db-diff" && a.text !== undefined) {
          const summary = summarizeDbDiffText(a.text);
          lines.push(`- DB 差分${summary !== undefined ? ` (${summary})` : ""}:`);
          lines.push("");
          lines.push(fence(a.text, "json"));
          continue;
        }
        if (a.name === "db-cleanup" && a.text !== undefined) {
          lines.push("- 後片付け(削除できなかった行や注意):");
          lines.push("");
          lines.push(fence(a.text, "json"));
          continue;
        }
        if (a.text !== undefined && a.contentType.startsWith("text/")) {
          // Playwright の error-context(失敗時のページ構造の抜粋)など。AI が画面の状態を知る材料になる
          lines.push(`- ${a.name}${a.path !== undefined ? ` (\`${rel(input.rootDir, a.path)}\`)` : ""}:`);
          lines.push("");
          lines.push(fence(a.text.length > MAX_TEXT_ATTACHMENT ? `${a.text.slice(0, MAX_TEXT_ATTACHMENT)}\n…(省略)` : a.text));
        } else if (a.path !== undefined) {
          lines.push(`- ${a.name}: \`${rel(input.rootDir, a.path)}\``);
        }
      }
      lines.push("");
    });
  }

  if (passed.length > 0) {
    lines.push(`## 成功 (${passed.length})`);
    lines.push("");
    for (const t of passed) lines.push(`- [${t.project}] ${t.title}`);
    lines.push("");
  }
  if (skipped.length > 0) {
    lines.push(`## スキップ (${skipped.length})`);
    lines.push("");
    for (const t of skipped) lines.push(`- [${t.project}] ${t.title}`);
    lines.push("");
  }
  // DB の後片付けに失敗した成功テストも知らせる(次回の実行に影響するため)
  const leftovers = passed.filter((t) => t.attachments.some((a) => a.name === "db-cleanup"));
  if (leftovers.length > 0) {
    lines.push("## 後片付けの注意 (成功したテスト)");
    lines.push("");
    for (const t of leftovers) {
      const a = t.attachments.find((x) => x.name === "db-cleanup");
      lines.push(`- [${t.project}] ${t.title}`);
      if (a?.text !== undefined) {
        lines.push("");
        lines.push(fence(a.text, "json"));
        lines.push("");
      }
    }
  }

  let text = lines.join("\n").replace(/\n{3,}/g, "\n\n");
  if (text.length > maxChars) {
    const note = `\n\n…(${maxChars} 文字を超えたため省略。全文は test-results/report.md)\n`;
    text = text.slice(0, Math.max(0, maxChars - note.length)) + note;
  }
  return text;
}

/** テキスト系の添付は本文を取り込む(body があればそれ、path だけなら読む。読めなければ undefined) */
function attachmentText(a: TestResult["attachments"][number]): string | undefined {
  const textual = a.contentType.startsWith("text/") || a.contentType === "application/json";
  if (!textual) return undefined;
  if (a.body !== undefined) return a.body.toString("utf8");
  if (a.path !== undefined) {
    try {
      return readFileSync(a.path, "utf8");
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export default class MarkdownReporter implements Reporter {
  private readonly options: ReportConfig;
  private rootDir = process.cwd();
  private startedAt = new Date();
  private readonly entries: ReportTestEntry[] = [];

  constructor(options: ReportConfig = {}) {
    this.options = options;
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    this.rootDir = config.configFile !== undefined ? path.dirname(config.configFile) : config.rootDir;
    this.startedAt = new Date();
    this.entries.length = 0;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // リトライがあるときは最後の結果だけを残す
    const existing = this.entries.findIndex((e) => e.file === test.location.file && e.line === test.location.line && e.title === test.titlePath().slice(3).join(" › "));
    const entry: ReportTestEntry = {
      project: test.parent.project()?.name ?? "",
      title: test.titlePath().slice(3).join(" › ") || test.title,
      file: test.location.file,
      line: test.location.line,
      status: result.status,
      expectedStatus: test.expectedStatus,
      durationMs: result.duration,
      errors: result.errors.map((e) => e.message ?? e.value ?? "").filter((m) => m !== ""),
      attachments: result.attachments.map((a) => ({
        name: a.name,
        contentType: a.contentType,
        path: a.path,
        text: attachmentText(a),
      })),
    };
    if (existing >= 0) this.entries[existing] = entry;
    else this.entries.push(entry);
  }

  async onEnd(result: FullResult): Promise<void> {
    const text = buildReport(
      { startedAt: this.startedAt, finishedAt: new Date(), status: result.status, tests: this.entries, rootDir: this.rootDir },
      this.options.maxChars ?? DEFAULT_MAX_CHARS,
    );
    const file = path.resolve(this.rootDir, this.options.file ?? DEFAULT_FILE);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${text}\n`, "utf8");
    const failed = this.entries.filter(isFailed).length;
    const clipboardWanted = (this.options.clipboard ?? true) && process.env["E2E_NO_CLIPBOARD"] === undefined;
    let clipNote = "";
    if (failed > 0 && clipboardWanted) {
      try {
        await writeClipboard(text);
        clipNote = "、クリップボードにコピーしました(AI チャットに貼ってください)";
      } catch (e) {
        clipNote = `、クリップボードへのコピーは失敗(${e instanceof Error ? e.message : String(e)})`;
      }
    }
    process.stdout.write(`\nレポート: ${rel(this.rootDir, file)}${clipNote}\n`);
  }
}
