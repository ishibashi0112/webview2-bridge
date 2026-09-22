import { defineConfig } from "vitest/config";

// 同梱する雛形のコピー(template/myapp/e2e/*.spec.ts は Playwright のテスト)と vb-runtime を Vitest の対象から外す
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
