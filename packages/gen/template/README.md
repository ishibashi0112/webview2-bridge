# template

新規アプリの雛形 `myapp/` のコピー。**手で編集しない。**

唯一の正はリポジトリの `templates/myapp/`。
`pnpm --filter @ishibashi0112/webview2-bridge-gen sync:template`（`pnpm build` でも自動実行）でここへコピーされ、
npm パッケージに同梱される。`init.test.ts` が templates/ と一致していることを検証する。

`webview2-bridge-gen init <dir> --name <AppName>` がこれをコピーし、`MyApp` / `myapp` をアプリ名に置換して書き出す。
`.gitignore` / `.npmrc` は npm pack が改名・除外してしまうので `_gitignore` / `_npmrc` として同梱し、init が元の名前に戻す。
`.gitattributes` は pack で消えないので、そのまま同梱する。
