import { describe, expect, it } from "vitest";
import { browserUse, defineE2EConfig, playwrightConfig } from "../src/config.js";
import { makeTestId, resolveTrackWhere } from "../src/fixtures.js";

const e2e = defineE2EConfig({
  web: { command: "pnpm --filter web dev", url: "http://localhost:5173" },
  host: { exe: "dotnet/MyApp.Host/bin/Debug/net48/MyApp.Host.exe" },
  db: { allowedDatabases: ["MyApp_Test"] },
});

describe("playwrightConfig", () => {
  it("screen / api / host の 3 プロジェクト、1 ワーカー、webServer、レポータ", () => {
    const c = playwrightConfig(e2e);
    expect(c.projects?.map((p) => p.name)).toEqual(["screen", "api", "host"]);
    expect(c.projects?.map((p) => p.testDir)).toEqual(["e2e/screen", "e2e/api", "e2e/host"]);
    expect(c.projects?.[1]?.use?.layer).toBe("api");
    expect(c.workers).toBe(1);
    expect(c.webServer).toMatchObject({ command: "pnpm --filter web dev", url: "http://localhost:5173" });
    expect(c.use?.e2e).toBe(e2e);
    expect(c.use?.baseURL).toBe("http://localhost:5173");
    expect(c.reporter).toEqual([["list"], ["@ishibashi0112/webview2-bridge-test/reporter", {}]]);
  });
  it("overrides は use をマージし、projects は差し替え", () => {
    const c = playwrightConfig(e2e, { testDir: "tests", overrides: { retries: 2, use: { trace: "on" }, projects: [{ name: "only" }] } });
    expect(c.retries).toBe(2);
    expect(c.use?.trace).toBe("on");
    expect(c.use?.e2e).toBe(e2e);
    expect(c.projects).toEqual([{ name: "only" }]);
    expect(c.testDir).toBe("tests");
  });
});

describe("browserUse", () => {
  it("E2E_BROWSER_EXECUTABLE があればそれ", () => {
    expect(browserUse({ E2E_BROWSER_EXECUTABLE: "/opt/chrome" }, "linux")).toEqual({ browserName: "chromium", launchOptions: { executablePath: "/opt/chrome" } });
  });
  it("Windows は既定で Edge、E2E_BROWSER_CHANNEL で変えられる", () => {
    expect(browserUse({}, "win32")).toEqual({ browserName: "chromium", channel: "msedge" });
    expect(browserUse({ E2E_BROWSER_CHANNEL: "" }, "win32")).toEqual({ browserName: "chromium" });
    expect(browserUse({ E2E_BROWSER_CHANNEL: "chrome" }, "darwin")).toEqual({ browserName: "chromium", channel: "chrome" });
    expect(browserUse({}, "darwin")).toEqual({ browserName: "chromium" });
  });
});

describe("fixtures helpers", () => {
  it("makeTestId は E2E-yyyymmdd-hhmm-xxxx", () => {
    expect(makeTestId(new Date(2026, 8, 22, 14, 5), "a7z9")).toBe("E2E-20260922-1405-a7z9");
    expect(makeTestId()).toMatch(/^E2E-\d{8}-\d{4}-[0-9a-z]{1,4}$/);
  });
  it("resolveTrackWhere は {testId} を置換し、関数には testId を渡す", () => {
    expect(resolveTrackWhere({ CustomerCode: "{testId}-C1", Qty: 1 }, "E2E-1")).toEqual({ CustomerCode: "E2E-1-C1", Qty: 1 });
    const fn = resolveTrackWhere((qb, id) => ({ id, qb }) as never, "E2E-2");
    expect(typeof fn).toBe("function");
    expect((fn as (qb: unknown) => unknown)("QB")).toEqual({ id: "E2E-2", qb: "QB" });
    expect(resolveTrackWhere(undefined, "x")).toBeUndefined();
  });
});
