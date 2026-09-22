import { defineConfig } from "@playwright/test";
import { playwrightConfig } from "@ishibashi0112/webview2-bridge-test/config";
import e2e from "./e2e/e2e.config";

// 3 つのプロジェクト: screen(ブラウザ + モック。どこでも走る)/ api・host(Windows で実 exe)。詳細は e2e/README.md
export default defineConfig(playwrightConfig(e2e));
