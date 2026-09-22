import { describe, expect, it } from "vitest";
import { buildReport, stripAnsi, type ReportTestEntry } from "../src/reporter.js";

const base = (over: Partial<ReportTestEntry>): ReportTestEntry => ({
  project: "host",
  title: "受注を登録すると Orders に 1 行増える",
  file: "/app/e2e/host/order.spec.ts",
  line: 12,
  status: "passed",
  expectedStatus: "passed",
  durationMs: 1234,
  errors: [],
  attachments: [],
  ...over,
});

const input = (tests: ReportTestEntry[]) => ({
  startedAt: new Date("2026-09-22T00:00:00"),
  finishedAt: new Date("2026-09-22T00:00:30"),
  status: "failed" as const,
  tests,
  rootDir: "/app",
});

describe("buildReport", () => {
  it("失敗をエラー本文・スクリーンショット・DB 差分付きで列挙し、成功は題名だけ", () => {
    const text = buildReport(
      input([
        base({
          status: "failed",
          errors: ["\u001b[31mError: expect(received).toHaveLength(expected)\u001b[0m\nExpected length: 1\nReceived length: 0"],
          attachments: [
            { name: "screenshot", contentType: "image/png", path: "/app/test-results/x/test-failed-1.png" },
            { name: "db-diff", contentType: "application/json", text: JSON.stringify({ Orders: { inserted: [], updated: [], deleted: [] } }) },
          ],
        }),
        base({ project: "screen", title: "空の keyword は入力検証エラー", file: "/app/e2e/screen/search.spec.ts", line: 3 }),
        base({ project: "screen", title: "skipped one", status: "skipped" }),
      ]),
    );
    expect(text).toContain("失敗 1 件");
    expect(text).toContain("合計 3 / 成功 1 / 失敗 1 / スキップ 1");
    expect(text).toContain("### 1. [host] 受注を登録すると Orders に 1 行増える");
    expect(text).toContain("`e2e/host/order.spec.ts:12`");
    expect(text).toContain("Error: expect(received).toHaveLength(expected)");
    expect(text).not.toContain("\u001b[");
    expect(text).toContain("スクリーンショット: `test-results/x/test-failed-1.png`");
    expect(text).toContain("DB 差分 (Orders: inserted 0 / updated 0 / deleted 0)");
    expect(text).toContain("- [screen] 空の keyword は入力検証エラー");
    expect(text).toContain("## スキップ (1)");
    expect(text).toContain("実装が仕様と違うなら実装を直し");
  });

  it("全件成功のときは失敗節が無い", () => {
    const text = buildReport(input([base({})]));
    expect(text).toContain("全件成功");
    expect(text).not.toContain("## 失敗");
  });

  it("上限を超えると省略の注記を付けて切り詰める", () => {
    const text = buildReport(input([base({ status: "failed", errors: ["x".repeat(5000)] })]), 1000);
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).toContain("文字を超えたため省略");
  });

  it("本文に ``` があってもフェンスが壊れない", () => {
    const text = buildReport(input([base({ status: "failed", errors: ["a\n```\nb"] })]));
    expect(text).toContain("````text\na\n```\nb\n````");
  });

  it("成功したテストの後片付け失敗は別節に出す", () => {
    const text = buildReport(input([base({ attachments: [{ name: "db-cleanup", contentType: "application/json", text: '{"failures":[{"table":"Orders"}]}' }] })]));
    expect(text).toContain("## 後片付けの注意");
  });

  it("stripAnsi", () => {
    expect(stripAnsi("\u001b[1mbold\u001b[22m")).toBe("bold");
  });
});

describe("buildReport: テキスト添付", () => {
  it("text/markdown の添付(error-context 等)は本文を取り込み、長ければ切る", () => {
    const text = buildReport(input([base({ status: "failed", errors: ["e"], attachments: [{ name: "error-context", contentType: "text/markdown", path: "/app/test-results/x/error-context.md", text: "- heading" }] })]));
    expect(text).toContain("- error-context (`test-results/x/error-context.md`):");
    expect(text).toContain("- heading");
    const long = buildReport(input([base({ status: "failed", errors: ["e"], attachments: [{ name: "error-context", contentType: "text/markdown", text: "y".repeat(10_000) }] })]));
    expect(long).toContain("…(省略)");
  });
});
