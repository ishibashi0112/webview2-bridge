import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bundledName, listTemplateFiles } from "../scripts/sync-template.mjs";
import type { GenerateConfig } from "../src/generate.js";
import { generate } from "../src/generate.js";
import { bundledTemplateDir, defaultAppName, renewProjectGuids, scaffold, validateAppName, TEMPLATE_NAME } from "../src/init.js";
import { genPackageVersion } from "../src/vb-runtime.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourceTemplate = path.join(repoRoot, "templates/myapp");
const bundled = bundledTemplateDir();

async function listRecursive(root: string): Promise<string[]> {
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

describe("bundled template", () => {
  it("template/myapp/ is in sync with templates/myapp/ (run `pnpm sync:template` if this fails)", async () => {
    const sourceFiles = listTemplateFiles(sourceTemplate);
    expect(sourceFiles.length).toBeGreaterThan(20);
    expect(await listRecursive(bundled)).toEqual(sourceFiles.map(bundledName).sort());
    for (const rel of sourceFiles) {
      const a = await readFile(path.join(sourceTemplate, rel), "utf8");
      const b = await readFile(path.join(bundled, bundledName(rel)), "utf8");
      expect(b, rel).toBe(a);
    }
  });

  it("pins this package's version in the template package.json files", async () => {
    const version = genPackageVersion();
    const root = JSON.parse(await readFile(path.join(bundled, "package.json"), "utf8")) as { devDependencies: Record<string, string> };
    expect(root.devDependencies["@ishibashi0112/webview2-bridge-gen"]).toBe(`^${version}`);
    const web = JSON.parse(await readFile(path.join(bundled, "web/package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(web.dependencies["@ishibashi0112/webview2-bridge-client"]).toBe(`^${version}`);
  });

  it("generated files in the template are up to date with this generator", async () => {
    // 契約は zod だけで書かれた形に一度落として読む（vitest のワーカーからは tsImport 越しに defineContract を辿れないため）
    const dir = await mkdtemp(path.join(os.tmpdir(), "wv2b-init-gen-"));
    try {
      const contractTs = await readFile(path.join(bundled, "contract/contract.ts"), "utf8");
      await writeFile(
        path.join(dir, "contract.ts"),
        contractTs
          .replace(/import \{ defineContract \} from "@ishibashi0112\/webview2-bridge-gen";\n/, "")
          .replace("defineContract(", "(")
          .replace(/^export type Contract = .*$/m, ""),
      );
      const config = JSON.parse(await readFile(path.join(bundled, "webview2-bridge.gen.json"), "utf8")) as GenerateConfig;
      const result = await generate(
        { ...config, contract: path.join(dir, "contract.ts") },
        { cwd: bundled, check: true },
      );
      expect(result.stale.map((f) => path.relative(bundled, f))).toEqual([]);
      expect(result.files.length).toBe(10);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("scaffold", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "wv2b-init-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("copies the template and renames MyApp / myapp everywhere", async () => {
    const target = path.join(dir, "inventory-app");
    const result = await scaffold({ targetDir: target, name: "InventoryApp" });
    const files = await listRecursive(target);
    expect(files).toEqual(result.files.slice().sort());
    expect(files).toContain("dotnet/InventoryApp.Host/InventoryApp.Host.vbproj");
    expect(files).toContain("dotnet/InventoryApp.sln");
    expect(files).toContain(".gitignore");
    expect(files).not.toContain("_gitignore");
    for (const rel of files) {
      expect(rel, rel).not.toContain(TEMPLATE_NAME);
      const content = await readFile(path.join(target, rel), "utf8");
      expect(content, rel).not.toContain(TEMPLATE_NAME);
      expect(content, rel).not.toMatch(/myapp/);
    }
    const pkg = JSON.parse(await readFile(path.join(target, "package.json"), "utf8")) as { name: string };
    expect(pkg.name).toBe("inventoryapp");
    const genConfig = await readFile(path.join(target, "webview2-bridge.gen.json"), "utf8");
    expect(genConfig).toContain('"namespace": "InventoryApp.Contract"');
    expect(await readFile(path.join(target, "dotnet/InventoryApp.Host/MainForm.vb"), "utf8")).toContain("Imports InventoryApp.Contract");
    // ランタイムの名前空間は変えない
    expect(await readFile(path.join(target, "dotnet/InventoryApp.Contract/Runtime/Dispatcher.vb"), "utf8")).toContain(
      "Namespace Global.WebView2Bridge.Runtime",
    );
  });

  it("renews project GUIDs in the .sln but keeps the project type GUID", async () => {
    const target = path.join(dir, "x");
    await scaffold({ targetDir: target, name: "Foo" });
    const template = await readFile(path.join(bundled, "dotnet/MyApp.sln"), "utf8");
    const out = await readFile(path.join(target, "dotnet/Foo.sln"), "utf8");
    const guidsOf = (s: string): string[] => [...s.matchAll(/^Project\("\{([0-9A-F-]+)\}"\).*"\{([0-9A-F-]+)\}"$/gim)].map((m) => m[2]!);
    const typeOf = (s: string): string[] => [...s.matchAll(/^Project\("\{([0-9A-F-]+)\}"\)/gim)].map((m) => m[1]!);
    expect(guidsOf(out)).toHaveLength(3);
    expect(typeOf(out)).toEqual(typeOf(template));
    for (const g of guidsOf(template)) expect(out).not.toContain(g);
    for (const g of guidsOf(out)) expect(out.split(g).length - 1).toBeGreaterThanOrEqual(5); // 定義 + 構成 4 行
    expect(out).toContain('"Foo.Contract", "Foo.Contract\\Foo.Contract.vbproj"');
  });

  it("refuses a non-empty target unless --force", async () => {
    await writeFile(path.join(dir, "keep.txt"), "x");
    await expect(scaffold({ targetDir: dir, name: "Foo" })).rejects.toThrow(/not empty/);
    await scaffold({ targetDir: dir, name: "Foo", force: true });
    expect(await readFile(path.join(dir, "keep.txt"), "utf8")).toBe("x");
  });

  it("validates the app name", () => {
    expect(() => validateAppName("Inventory_App2")).not.toThrow();
    expect(() => validateAppName("my-app")).toThrow(/invalid app name/);
    expect(() => validateAppName("1st")).toThrow(/invalid app name/);
    expect(() => validateAppName("My.App")).toThrow(/invalid app name/);
    expect(() => validateAppName("MyApp")).toThrow(/placeholder/);
  });

  it("derives a PascalCase default name from the directory", () => {
    expect(defaultAppName("inventory-app")).toBe("InventoryApp");
    expect(defaultAppName("parts_search")).toBe("PartsSearch");
    expect(defaultAppName("Foo")).toBe("Foo");
    expect(defaultAppName("2024-tool")).toBe("App2024Tool");
  });

  it("renewProjectGuids leaves non-project GUIDs alone", () => {
    const sln = `Project("{F184B08F-C81C-45F6-A57F-5ABD9991F28F}") = "A", "A\\A.vbproj", "{11111111-1111-1111-1111-111111111111}"
EndProject
Global
\tGlobalSection(ExtensibilityGlobals) = postSolution
\t\tSolutionGuid = {22222222-2222-2222-2222-222222222222}
\tEndGlobalSection
EndGlobal
`;
    const out = renewProjectGuids(sln);
    expect(out).toContain("{F184B08F-C81C-45F6-A57F-5ABD9991F28F}");
    expect(out).toContain("{22222222-2222-2222-2222-222222222222}");
    expect(out).not.toContain("{11111111-1111-1111-1111-111111111111}");
  });
});
