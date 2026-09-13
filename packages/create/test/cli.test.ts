import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

function run(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [tsxCli, path.join(pkgDir, "src/cli.ts"), ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "wv2b-create-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("create-webview2-bridge", () => {
  it("scaffolds an app through the gen package (name from --name)", async () => {
    const r = run(["my-app", "--name", "MyInventory"], dir);
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Created MyInventory in");
    expect(r.stdout).toContain("dotnet run --project dotnet/MyInventory.Host");
    const files = await readdir(path.join(dir, "my-app", "dotnet"));
    expect(files.sort()).toEqual(["Directory.Build.props", "MyInventory.Contract", "MyInventory.Host", "MyInventory.Impl", "MyInventory.sln"]);
    expect(await readFile(path.join(dir, "my-app", "package.json"), "utf8")).toContain('"name": "myinventory"');
  });

  it("derives the name from the directory when --name is omitted", async () => {
    const r = run(["inventory-app"], dir);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Created InventoryApp in");
  });

  it("fails clearly on a bad name or a non-empty directory", async () => {
    const bad = run(["x", "--name", "my-app"], dir);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("invalid app name");
    await writeFile(path.join(dir, "keep.txt"), "x");
    const full = run(["."], dir);
    expect(full.status).toBe(1);
    expect(full.stderr).toContain("not empty");
  });

  it("prints usage without a directory", () => {
    const r = run([], dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("pnpm create webview2-bridge <dir>");
  });
});
