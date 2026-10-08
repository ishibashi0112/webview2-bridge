# 引継ぎ書: SBOM 移行で分かった webview2-bridge の改善提案

作成日: 2026-10-08
出どころ: `ishibashi0112/s-b`(SBOM。webview2-bridge 0.5.0 の雛形から作った業務アプリ。S-BOM 5 画面を 1 exe + 画面ごとのウィンドウに移行し、2026-10-08 に main へマージ = コミット 73e3713)。
対象: このリポジトリ(gen / client / test / VB ランタイム / 雛形 `templates/myapp`)。現状の記述は 0.5.1(main 1672f34)で確かめた。

この文書だけで作業できるように、SBOM 側の実装もここに抜き出してある。SBOM のリポジトリを見られる場合は、各項目の「SBOM の実装」のパスで全体を見られる。

---

## 0. 進め方

- 方針は HANDOFF.md §2(とくに「既存の業務アプリが壊れない」)に従う。**すべて破壊的変更なし**(既定の動きは今のまま。足すものは opt-in か、今まで壊れていた入力だけが変わる)
- 決めたことは HANDOFF.md §10 に追記する。VB ランタイムや雛形を直したら gen のバージョンを上げる(CLAUDE.md)
- 1 項目 = 1 コミットを目安に、下の優先度の順に進める。P1 は小さく効果が大きいので、まとめて 0.5.2 にしてよい
- 判断が要る箇所は「決めること」に書いた。迷ったら推奨案で進めて §10 に記録する

| 優先 | ID | 内容 | 種類 | 規模 |
|---|---|---|---|---|
| P1 | A-1 | enum に空文字があると、コンパイルできない VB を生成する | gen の不具合 | 小 |
| P1 | B-1 | 雛形の Release ビルドで F12(開発者ツール)・F5(再読込)が効く | 雛形の不具合 | 小 |
| P1 | A-2 | Object のメンバー名(Finalize 等)とぶつかる名前を検出しない | gen | 小 |
| P2 | A-3 | 実装の登録漏れに起動時に気づけない | gen / ランタイム | 小 |
| P2 | B-2 | 画面ファイルのキャッシュで、入れ替え後に古い画面が出る | 雛形 | 小 |
| P2 | B-3 | 業務エラー(入力欄つき)の決まりが無く、アプリごとに作る | ランタイム / client | 中 |
| P2 | B-4 | 配布の形: exe の隣に DLL などを並べずフォルダにまとめる(opt-in) | 雛形 | 中 |
| P3 | A-4 | 小数が Double にしかならない(お金・工数は Decimal にしたい) | gen | 中 |
| P3 | C-1 | 画面テストで、モックの応答をテストごとに差し替えられない | client / test | 中 |
| P3 | C-2 | host 層のテストが 1 ウィンドウ前提 | test | 中 |
| P3 | B-5 | 共有フォルダへの配布スクリプト(使用中の検出・控え・記録) | 雛形 | 中 |
| P3 | D-1 | 文書: 公開直後の版を入れるときの pnpm の minimumReleaseAge | 文書 | 小 |

---

## A. 生成器(packages/gen)

### A-1. enum に空文字があると、コンパイルできない VB を生成する(P1)

**現状**: `packages/gen/src/emit-vb.ts` の `renderEnum` は、値ごとに `toIdentifier(v)`(`naming.ts`)で定数名を作る。`toIdentifier("")` は `pascalCase("")` が空なので `"_"` を返し、次の行ができる。

```vb
Public Const _ As String = ""   ' VB では "_" 単独は識別子にならない(行継続文字)→ コンパイルエラー
```

記号だけの値(`"-"`、`"*"` など)も同じく `_` になる(2 つ目以降は `__`、`___`)。

**SBOM で困ったこと**: 計画工事展開の単価不備 `priceWarn` は「空 = 不備なし / N1 / N2 / N3」。`z.enum(["", "N1", "N2", "N3"])` にしたら Contract のビルドが通らず、`z.string()` に変えて逃げた(TS 側の型の絞り込みを失った)。

**提案**:
- 空文字は `Empty`、記号だけの値は `Value1`, `Value2` …(または値の文字コード由来の名前)にする。すでに同じ名前があれば今の重複回避(`_` を足す)と同じ規則
- どうしても名前を作れない値は、生成時に `GenerateError`(パス付き)で止める。コンパイルエラーまで進ませない
- TS 側(`emit-ts.ts`)は値をそのまま使うので変更不要のはず(確かめる)

**完了条件**: `packages/gen/test/emit-vb.test.ts` に `z.enum(["", "A", "-"])` のケースを足し、生成物に `Public Const Empty As String = ""` が出ること。スナップショットを更新。

### A-2. Object のメンバー名とぶつかる名前を検出しない(P1)

**現状**: `naming.ts` の `VB_KEYWORDS` は VB の予約語で、ぶつかったら `[Name]` と角かっこで囲む。`Finalize` / `ToString` / `Equals` / `GetHashCode` / `MemberwiseClone` / `ReferenceEquals` は予約語ではないので素通しになる(`GetType` だけは一覧にある)。

これらがメソッド名(`Interfaces.vb` の `Function Finalize(req As …)`)やプロパティ名(DTO の `Public Property ToString As …`)になると、実装クラスや DTO で基底クラス Object のメンバーとぶつかる。角かっこでは避けられない(予約語の問題ではなく、名前が同じことの問題)。

**SBOM で困ったこと**: モジュール登録の「確定」を契約で `finalize` にしかけ、生成される `Finalize` が Object.Finalize とぶつかる恐れに気づいて `finalizeVersion` に変えた(実際のコンパイル結果は試していない。警告で済むか、エラーになるかは要確認)。

**提案**: 生成時に、メソッド名・プロパティ名・イベント名が Object のメンバー名(大文字小文字を区別しない)と同じなら `GenerateError` で止め、「契約の名前を変えてください」と出す。自動で名前を変える(`FinalizeMethod` など)と、VB 側の実装者が戸惑うので推奨しない。

**完了条件**: `emit-vb.test.ts` に、メソッド `finalize`・プロパティ `toString` のケースを足し、分かりやすいエラーになること。

### A-3. 実装の登録漏れに起動時に気づけない(P2)

**現状**: 生成される `DispatcherExtensions` には、全メソッド名 `MethodNames` と、名前空間ごとの `Register(dispatcher, api)` がある。ランタイムの `Dispatcher` には `RegisteredMethods` がある。ただ、両者を突き合わせる仕組みは無い。

ホストで `dispatcher.Register(New XxxApi(...))` を書き忘れると、その画面から呼んだときに初めて `-32601 Method not found` になる。

**SBOM で困ったこと**: 画面を足すたびに `ScreenForm.vb` に Register を 1 行足す(SBOM は 8 つの名前空間)。今回は漏れなかったが、手順書(SBOM の CLAUDE.md)に「ScreenForm で Register」と書いて人手で守っている。

**提案**(どちらか。推奨は 1):
1. **生成物に起動時の確かめ用の関数を足す**: `DispatcherExtensions.MissingMethods(dispatcher) As String()`(`MethodNames` のうち `RegisteredMethods` に無いもの)。雛形の `MainForm` で、Debug ビルドのときだけ確かめて、足りなければ MessageBox で知らせる。Release では確かめない(起動を遅らせない)
2. **全名前空間を引数に取る `RegisterAll(app As IAppApi, diag As IDiagApi, …)` を生成する**: 渡し忘れはコンパイルエラーになる。ただし名前空間ごとに実装場所が違う(Host と Impl)アプリでは書きにくく、名前空間を足すと既存の呼び出しが壊れる(破壊的)ので、1 の方がよい

**完了条件**: `dotnet/WebView2Bridge.Contract.Tests` に、登録漏れを `MissingMethods` で検出するテストを足す。

### A-4. 小数が Double にしかならない(P3)

**現状**: `emit-vb.ts` の `resolveType` は `number` を `Double`、`integer` を `Integer`(`format: "int64"` なら `Long`)にする。Decimal を選ぶ方法が無い。

**SBOM で困ったこと**: 原価・工数・金額は Oracle では NUMBER(Decimal)。DTO が Double なので、VB 側で `CDbl(dec)` / `CDec(dbl)` を書き分けた(例: `p.CostAmt = CDbl(CDec(p.Cost) * p.Qtys)`)。いまのところ誤差の問題は出ていないが、お金を Double で往復するのは避けたい。

**提案**:
- 契約で `z.number().meta({ vbType: "Decimal" })`(または `format: "decimal"`)を付けた項目だけ、VB の型を `Decimal` にする。既定は今の Double のまま(破壊的変更なし)
- JSON の数値 ⇔ Decimal は Newtonsoft.Json がそのまま扱える(`FloatParseHandling` の設定で Decimal を保つかを確かめる)
- TS 側・OpenAPI 側は number のまま(OpenAPI は `format: decimal` を付けるかを決める)

**決めること**: meta のキー名(`vbType` にするか、JSON Schema の `format` に乗せるか)。

---

## B. 雛形(templates/myapp)とランタイム

### B-1. Release ビルドでも F12・F5 が効く(P1)

**現状**: `templates/myapp/dotnet/MyApp.Host/MainForm.vb` は `core.Settings.AreDevToolsEnabled = True` を常に設定している。`AreBrowserAcceleratorKeysEnabled` は既定(True)のまま。

**SBOM で困ったこと**: 本番(Release)でも F12 で開発者ツールが開き、F5 / Ctrl+R で画面が再読込されてしまう。**再読込すると、編集中の未保存の内容が確認なしに消える**(閉じるときの「未保存の変更があります」の確認は WinForms の FormClosing なので、再読込では出ない)。

**SBOM の実装**(`dotnet/SBOM.Host/ScreenForm.vb`、`WindowManager.vb`):

```vb
' WindowManager: Debug ビルドは常に開発モード。Release でも環境変数 SBOM_DEV=1 で開発モードにできる(本番で調べるとき用)
#If DEBUG Then
        DevMode = True
#Else
        DevMode = Environment.GetEnvironmentVariable(DevModeEnvVar) = "1"
#End If

' ScreenForm(WebView2 の初期化)
core.Settings.AreDevToolsEnabled = _manager.DevMode
' F5 / Ctrl+R の再読込で未保存の内容が消えないよう、本番ではブラウザのショートカットを無効にする(F12 も含む)
core.Settings.AreBrowserAcceleratorKeysEnabled = _manager.DevMode
' window.open やリンクの別ウィンドウ表示は使わない
AddHandler core.NewWindowRequested, Sub(sender, args) args.Handled = True
```

SBOM は `app.getContext` で `devMode` を画面に返し、開発用の画面(動作確認)は開発モードのときだけランチャーに出している。2026-10-08 に会社 PC で、Release では F12 も F5 も効かないことを確認した。

**提案**: 雛形の `MainForm` を上の形にする(環境変数名は `WEBVIEW2_BRIDGE_DEV` など雛形の名前にそろえる)。`NewWindowRequested` の扱いは、雛形では「既定のブラウザで開く」にするか止めるかを決める。

**決めること**: 開発モードの環境変数名。`NewWindowRequested` を止めるか。

**完了条件**: 雛形から作ったアプリを Release でビルドし、F12・F5 が効かないこと(Windows 実機)。Debug では今までどおり効くこと。

### B-2. 画面ファイルのキャッシュで、入れ替え後に古い画面が出る(P2)

**現状**: 雛形は `core.Navigate($"https://{VirtualHost}/index.html")` で毎回同じ URL を開く。WebView2 のキャッシュ(`%LOCALAPPDATA%\<アプリ名>`)に古い index.html が残っていると、wwwroot を入れ替えた後も古い画面が出ることがある(js / css は Vite がファイル名にハッシュを付けるので、index.html さえ新しければよい)。

**SBOM の実装**(`dotnet/SBOM.Host/WindowManager.vb` の `StartUrl`):

```vb
' 画面を入れ替えた後に WebView2 のキャッシュから古い index.html を出さないよう、index.html の更新日時を付ける
' (js / css は Vite がファイル名に内容のハッシュを付けるので、index.html が新しければ全部新しくなる)
Dim index = Path.Combine(WwwRoot, "index.html")
Dim stamp = If(File.Exists(index), File.GetLastWriteTimeUtc(index).Ticks.ToString(CultureInfo.InvariantCulture), "0")
Return $"https://{VirtualHost}/index.html?v={stamp}{hash}"
```

**提案**: 雛形の `MainForm` に同じ処理を入れる。共有フォルダに置いて上書き配布するアプリでは必須。

### B-3. 業務エラー(入力欄つき)の決まりが無い(P2)

**現状**: HANDOFF.md §5 は「アプリ定義のエラーは -32000 以下」とだけ決めている。`JsonRpcException(code, message, data)` と、client の `BridgeError`(`code` / `message` / `data` / `method`)はある。業務エラー(利用者にそのまま見せるメッセージ)と、それが結び付く入力欄の伝え方は、アプリごとに作ることになる。

**SBOM の実装**(どの画面でも使った):

```vb
' SBOM.Impl/Infrastructure/AppErrorCodes.vb
Public Const Business As Integer = -32010        ' 業務エラー。message をそのまま利用者に見せる
Public Const FileWriteFailed As Integer = -32011 ' ファイルに書き込めない

' SBOM.Impl/Infrastructure/AppErrors.vb
Public Shared Function Business(message As String, Optional field As String = Nothing) As JsonRpcException
    If String.IsNullOrEmpty(field) Then Return New JsonRpcException(AppErrorCodes.Business, message)
    Return New JsonRpcException(AppErrorCodes.Business, message, New Dictionary(Of String, String) From {{"field", field}})
End Function
```

```ts
// web/src/app/errors.ts
export function isUserFacingError(e: unknown): e is BridgeError {
  return e instanceof BridgeError && (e.code === AppErrorCodes.Business || e.code === AppErrorCodes.FileWriteFailed);
}
/** 業務エラーが結び付く入力項目(要求の JSON 名)。結び付かなければ undefined */
export function errorField(e: unknown): string | undefined { /* e.data.field が文字列なら返す */ }
/** モック用: 業務エラーを作る(VB と同じ形) */
export function businessError(message: string, method?: string, field?: string): BridgeError { … }
```

画面は「field があればその入力欄の下」「無ければ画面上部の赤い枠」「業務エラーでなければエラー詳細ダイアログ」と出し分けている。

**提案**:
- 業務エラーのコード(例: `-32010`)と `data.field` の形を HANDOFF.md §5 の決まりにする
- VB ランタイムに `JsonRpcException.Business(message, Optional field)`(または `BusinessException`)を足す
- client に `isBusinessError(e)` / `errorField(e)` / `businessError(message, field)`(モック用)を足す
- `field` は契約の要求の JSON 名(camelCase)。生成器が要求の項目名を定数で出すかは任意

**決めること**: コード番号(-32010 でよいか)。ファイル書き込み失敗のような「利用者向けだが業務エラーではない」ものも決まりに入れるか。

### B-4. 配布の形: exe の隣に DLL などを並べず、フォルダにまとめる(P2・opt-in)

**現状**: 雛形の出力は、exe の隣に DLL・`WebView2Loader.dll`・`runtimes\`・`wwwroot\` が並ぶ。

**SBOM で困ったこと**: 社内の旧画面は、共有フォルダにある母艦(メニューの exe)と同じ階層に置かれ、母艦がそこから各 exe を起動する。同じ階層に 20 個以上のファイルを並べたくない、という要望があった。

**SBOM の実装**(案 A。2026-10-08 に会社 PC で起動を確認): 出力は直下が `SBOM.exe` と `SBOM.exe.config` だけで、残りはすべて `SBOM\` に入る。

1. **DLL**: `App.config` の probing で `SBOM\` から読む(.NET Framework の標準の仕組み。bindingRedirect もそのまま効く)

   ```xml
   <runtime>
     <assemblyBinding xmlns="urn:schemas-microsoft-com:asm.v1">
       <probing privatePath="SBOM" />
     </assemblyBinding>
   </runtime>
   ```

2. **参照 DLL の出力先**(`SBOM.Host.vbproj`): NuGet とプロジェクト参照の DLL を `SBOM\` に出す。WPF 版の WebView2 と、NuGet が runtimes に置く Loader は出さない

   ```xml
   <SbomFilesDir>SBOM\</SbomFilesDir>
   <WebView2NeverCopyLoaderDllToOutputDirectory>true</WebView2NeverCopyLoaderDllToOutputDirectory>
   …
   <PackageReference Include="Microsoft.Web.WebView2" Version="…" GeneratePathProperty="true" />
   <None Include="$(PkgMicrosoft_Web_WebView2)\runtimes\win-x64\native\WebView2Loader.dll"
         Link="$(SbomFilesDir)WebView2Loader.dll" CopyToOutputDirectory="PreserveNewest" Visible="false" />
   <Target Name="SbomPlaceReferencesInFilesDir" BeforeTargets="_CopyFilesMarkedCopyLocal">
     <ItemGroup>
       <ReferenceCopyLocalPaths Remove="@(ReferenceCopyLocalPaths)"
         Condition="'%(Filename)' == 'Microsoft.Web.WebView2.Wpf' Or '%(Filename)' == 'WebView2Loader'" />
       <ReferenceCopyLocalPaths Update="@(ReferenceCopyLocalPaths)"
         DestinationSubDirectory="$(SbomFilesDir)%(ReferenceCopyLocalPaths.DestinationSubDirectory)" />
     </ItemGroup>
   </Target>
   ```

3. **WebView2Loader.dll**: exe の起動直後(WebView2 のほかの呼び出しより前)に読む場所を指定する

   ```vb
   Public Shared ReadOnly Property FilesRoot As String
       Get
           Return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, FilesDirName)
       End Get
   End Property
   Public Shared Sub ConfigureWebView2Loader()   ' Program.Main の最初で呼ぶ
       If File.Exists(Path.Combine(FilesRoot, "WebView2Loader.dll")) Then
           CoreWebView2Environment.SetLoaderDllFolderPath(FilesRoot)
       End If
   End Sub
   ```

4. **wwwroot とローカル設定**: `FilesRoot\wwwroot` を仮想ホストに割り当てる。資格情報を入れるローカル設定は `<appSettings file="SBOM\SBOM.local.config">`。web/dist のコピー先も `$(OutDir)$(SbomFilesDir)wwwroot`(ソースマップ `*.map` は除く)
5. **デバッグ情報**: `Directory.Build.props` に `<DebugType>embedded</DebugType>`(pdb を DLL に埋め込み、ファイルを減らす。例外の行番号は出る)

**提案**: 雛形に opt-in の設定を足す。例: `MyApp.Host.vbproj` の `<AppFilesDir>`(空 = 今の形、`MyApp\` = まとめる)。App.config の probing も、この値から作るか雛形の生成時に書き分ける。`init` の質問に足すかは任意。

**決めること**: 既定を今の形のままにするか(推奨: 今のまま。opt-in)。

**注意**: 以前の形で出力したフォルダに古い DLL が直下に残ると、`SBOM\` より先にそちらが読まれる。SBOM はビルド後に直下の `*.dll` / `*.pdb` / `wwwroot` / `runtimes` を消すターゲットを入れた(`SbomRemoveOldLayout`)。

### B-5. 共有フォルダへの配布スクリプト(P3)

**SBOM の実装**: `scripts/deploy.ps1`(Windows PowerShell 5.1 で動く書き方、UTF-8 BOM 付き)。2026-10-08 に会社 PC で、テスト用フォルダへの配布と使用中の検出を確認した(控えから戻すのは Linux の PowerShell 7 でだけ確認)。

1. Release ビルド(`pnpm build:web` → `dotnet build -c Release`。`-SkipBuild` で省略)
2. 配布物がそろっているか確かめる(exe・exe.config・まとめたフォルダ・`index.html`)
3. **使用中の確認**: 配布先の exe・DLL を `[IO.File]::Open(path, Open, ReadWrite, None)` で全部開いてみる。1 つでも開けなければ「使っている人がいるため入れ替えられません(何も変えていません)」で止める。途中まで入れ替わった状態を作らない。権限エラー(`UnauthorizedAccessException`)は別のメッセージ
4. 確認(y/N。`-Yes` で省略。`-DryRun` で確かめるだけ)
5. 配布先の今の版を、配布した PC の `artifacts\deploy-backup\<日時>\` に控える
6. まとめたフォルダ → exe.config → exe の順に入れ替える。資格情報のローカル設定は配布先の物を残す
7. 記録 `deploy-info.txt`(日時・配布した人・git のコミット・コミットしていない変更の有無・控えの場所)
8. 元に戻すときは `-SkipBuild -Source <控え>`

**提案**: B-4 を入れるなら、雛形の `scripts/` にこのスクリプトを入れる(アプリ名の部分は雛形のプレースホルダ)。

---

## C. テスト(packages/test・client の MemoryTransport)

### C-1. 画面テストで、モックの応答をテストごとに差し替えられない(P3)

**現状**: 雛形の `web/src/bridge.ts` は `new MemoryTransport<Contract>(handlers)` に固定のモックを渡す。テスト(e2e/screen)からは応答を変えられないので、「取得に失敗したとき」「権限が無いとき」などはモックのデータに特別な値を仕込んで再現するしかない。

**SBOM で困ったこと**:
- 本番(開発モードでない)の見え方を試すため、モックの `app.getContext` に「URL に `?dev=0` があれば `devMode: false`」という抜け道を足した
- 失敗のケースは、モックのデータに「この機種なら SQL Server の取得に失敗する」などの約束を作って再現した(モックが読みにくくなる)

**提案**: MemoryTransport に、テストから応答を差し替える口を足す。例:
- 開発ビルドで `window.__webview2BridgeMock.override("app.getContext", (input) => ({ … }))` / `.reset()` を公開する(`__webview2Bridge` と同じく開発ビルドだけ)
- packages/test に、`page.addInitScript` で起動前に差し替えるヘルパ `mockOverride(page, method, handler)` を足す。handler は文字列化してページへ送るので、純粋な関数に限る(またはデータだけを渡す `mockReturn(page, method, value)` / `mockThrow(page, method, { code, message, data })`)

### C-2. host 層のテストが 1 ウィンドウ前提(P3)

**現状**: `packages/test/src/host.ts` は、CDP で取ったページのうち最初の `about:blank` でないもの(`pages.find(...) ?? pages[0]`)を使う。

**SBOM で困ったこと**: SBOM はランチャーから画面ごとに別ウィンドウを開く(各ウィンドウが別の WebView2。ブラウザプロセスは共有なので、CDP では 1 つのブラウザに複数のページが見える)。host 層で 2 つ目のウィンドウを操作する手段が無い(SBOM 全体設計 §12 に記録済み。host 層のテストは、ランチャーで［接続確認］を押して「開きました」と出るところまでにした)。

**提案**: fixture に `hostWindows()`(全ページ)と `waitForWindow(predicate)`(例: URL のハッシュが `#/screens/moduleReg` のページが現れるまで待つ)を足す。既存の `page` fixture は今のまま。

---

## D. 文書

### D-1. 公開直後の版を入れるときの pnpm の minimumReleaseAge(P3)

**SBOM で困ったこと**: 公開した当日の `@ishibashi0112/spreadsheet-grid@0.45.0` を入れたとき、pnpm 11 が「公開から 24 時間以内の版」として扱い、`pnpm-workspace.yaml` の `minimumReleaseAgeExclude` にその版を自動で足した(何のための記述か分からず、後で調べることになった)。webview2-bridge も、新しい版を公開してすぐアプリに入れる流れなので、同じことが起きる。

**提案**: RELEASING.md(と雛形の README)に、「公開当日に入れると `minimumReleaseAgeExclude` に版が足される。翌日以降は消してよい」と書く。

---

## 参考: SBOM 側の後追い(任意。急がない)

webview2-bridge の新しい版が出たら、SBOM でも次を合わせられる。どれも今のままで動いているので、急がない。

- A-1: 計画工事展開の `priceWarn` を `z.enum(["", "N1", "N2", "N3"])` に戻す
- B-3: `AppErrors` / `errors.ts` をランタイム・client の物に置き換える
- C-1: モックの `?dev=0` の抜け道を、差し替えの口に置き換える
