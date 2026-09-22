import { defineConfig } from "@playwright/test";
import { playwrightConfig } from "@ishibashi0112/webview2-bridge-test/config";
import e2e from "./e2e/e2e.config";

// screen(L1: ブラウザ + MemoryTransport。どこでも走る)/ api(L2)/ host(L3)(Windows で実 exe)
export default defineConfig(playwrightConfig(e2e));
