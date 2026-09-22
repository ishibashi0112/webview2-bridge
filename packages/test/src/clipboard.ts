/**
 * レポートをクリップボードへ(petari の infra/clipboard.ts と同じ方式。OS コマンドを配列引数で呼ぶ)。
 *   macOS: pbcopy / Windows: PowerShell Set-Clipboard(UTF-8 の一時ファイル経由)/ Linux: xclip があれば
 */
import { execFile, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

function viaStdin(command: string, args: string[], text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))));
    child.stdin.end(text, "utf8");
  });
}

export async function writeClipboard(text: string): Promise<void> {
  if (process.platform === "darwin") {
    await viaStdin("pbcopy", [], text);
    return;
  }
  if (process.platform === "win32") {
    const dir = mkdtempSync(join(tmpdir(), "wv2b-clip-"));
    const file = join(dir, "report.txt");
    try {
      writeFileSync(file, text, "utf8");
      const quoted = `'${file.replaceAll("'", "''")}'`;
      await execFileP("powershell", ["-NoProfile", "-Command", `Get-Content -Raw -Encoding UTF8 -LiteralPath ${quoted} | Set-Clipboard`]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    return;
  }
  await viaStdin("xclip", ["-selection", "clipboard"], text);
}
