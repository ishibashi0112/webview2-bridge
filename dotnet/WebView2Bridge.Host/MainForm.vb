Option Strict On

Imports System
Imports System.Globalization
Imports System.IO
Imports System.Windows.Forms
Imports Microsoft.Web.WebView2.Core
Imports WebView2Bridge.Contract
Imports WebView2Bridge.Impl
Imports WebView2Bridge.Runtime
Imports WebView2Bridge.WinForms

''' <summary>
''' 窓 + WebView2 + Dispatcher。人間が書くホスト側はこのファイルと WebViewBridge だけ。
'''   Debug かつ環境変数 WEBVIEW2_BRIDGE_DEV_URL があれば Vite dev server へ（通常 http://localhost:5173）
'''   それ以外は exe 隣の wwwroot を https://app.local/ にマッピングして index.html を開く
'''   F12（開発者ツール）と F5 / Ctrl+R（再読込）などブラウザのショートカットは開発モード（DevMode）のときだけ有効
'''   画面の window.open(自アプリの URL) はブリッジ付きの別ウィンドウ（BridgeWindows。オプション機能で、この見本では有効）
''' </summary>
Public Class MainForm

    Public Const VirtualHost As String = "app.local"
    Public Const DevUrlEnvVar As String = "WEBVIEW2_BRIDGE_DEV_URL"
    Public Const DevModeEnvVar As String = "WEBVIEW2_BRIDGE_DEV"

    Private _bridge As WebViewBridge
    Private _windows As BridgeWindows

    ''' <summary>
    ''' 開発モード。Debug ビルドは常に True。Release でも環境変数 WEBVIEW2_BRIDGE_DEV=1 で True にできる（本番で調べるとき用）。
    ''' 本番（Release、環境変数なし）では F12 が開かず、F5 / Ctrl+R の再読込で編集中の内容が消えることもない
    ''' </summary>
    Public Shared ReadOnly Property DevMode As Boolean
        Get
#If DEBUG Then
            Return True
#Else
            Return Environment.GetEnvironmentVariable(DevModeEnvVar) = "1"
#End If
        End Get
    End Property

    Private Async Sub MainForm_Load(sender As Object, e As EventArgs) Handles MyBase.Load
        Try
            ' ユーザーデータは exe 隣ではなく LocalAppData に置く（Program Files 配下でも動くように）
            Dim userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "WebView2Bridge.Host")
            Dim env = Await CoreWebView2Environment.CreateAsync(Nothing, userDataFolder)
            Await WebView.EnsureCoreWebView2Async(env)

            Dim core = WebView.CoreWebView2
            ' F12（開発者ツール）は開発モードだけ。ブラウザのショートカット（F5 / Ctrl+R の再読込、Ctrl+F、Ctrl+P、Ctrl+± のズーム等）も
            ' 本番では無効にする（再読込は FormClosing を通らないので、未保存の内容が確認なしに消える）。
            ' 画面側の JavaScript の keydown は影響を受けないので、必要なショートカットは画面で実装する
            core.Settings.AreDevToolsEnabled = DevMode
            core.Settings.AreBrowserAcceleratorKeysEnabled = DevMode
            core.Settings.AreDefaultContextMenusEnabled = True
            core.Settings.IsStatusBarEnabled = False

            Dim devUrl = DevServerUrl()

            ' 契約の実装を Dispatcher に登録する
            Dim dispatcher As New Dispatcher()
            _bridge = New WebViewBridge(WebView, dispatcher)
            ' サブウィンドウ（オプション機能。HANDOFF.md §10）: window.open / target="_blank" のうち自アプリの URL は、同じ Dispatcher に
            ' つないだ別ウィンドウで開き、features の位置・大きさに置く。外部の http(s) は既定のブラウザ、それ以外は止める。
            ' 使わないアプリは NewWindowRequested で http(s) をブラウザに渡し、それ以外を止めるだけにする（雛形の MainForm の形）
            _windows = New BridgeWindows(env, dispatcher, Me, If(devUrl, $"https://{VirtualHost}/"), AddressOf MapVirtualHost)
            _windows.Attach(_bridge)
            ' Host → Web の通知は開いている全部の窓に届く
            Dim events As New BridgeEvents(_windows.Emitter)
            dispatcher.Register(New PartsApi(events))
            If DevMode Then
                ' 登録漏れ（契約にあるのに Register していないメソッド）を起動時に知らせる。本番では確かめない
                Dim missing = dispatcher.MissingMethods()
                If missing.Length > 0 Then
                    MessageBox.Show(
                        "Dispatcher に登録されていないメソッドがあります。MainForm.vb の dispatcher.Register(...) を確認してください:" & Environment.NewLine &
                        String.Join(Environment.NewLine, missing),
                        Text, MessageBoxButtons.OK, MessageBoxIcon.Warning)
                End If
            End If
            _bridge.Attach()

            If devUrl IsNot Nothing Then
                Text = $"WebView2Bridge.Host - dev ({devUrl})"
                core.Navigate(devUrl)
            Else
                If Not File.Exists(Path.Combine(WwwRoot, "index.html")) Then
                    ' 無いフォルダを SetVirtualHostNameToFolderMapping に渡すと DirectoryNotFoundException になるので、ここで止める
                    MessageBox.Show(
                        $"wwwroot が見つかりません: {WwwRoot}{Environment.NewLine}" &
                        "`pnpm --filter web build` の後に Host をビルドすると dist がコピーされます。" & Environment.NewLine &
                        $"開発中は環境変数 {DevUrlEnvVar}=http://localhost:5173 を設定して起動してください。",
                        Text, MessageBoxButtons.OK, MessageBoxIcon.Warning)
                    Return
                End If
                MapVirtualHost(core)
                core.Navigate(StartUrl(WwwRoot))
            End If
        Catch ex As Exception
            MessageBox.Show(ex.ToString(), "WebView2 の初期化に失敗しました", MessageBoxButtons.OK, MessageBoxIcon.Error)
        End Try
    End Sub

    ''' <summary>exe 隣の wwwroot（apps/web の dist を CopyWebDist がコピーしたもの）</summary>
    Private Shared ReadOnly Property WwwRoot As String
        Get
            Return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot")
        End Get
    End Property

    ''' <summary>https://app.local/ を wwwroot に割り当てる。CoreWebView2 ごとの設定なので、子ウィンドウにも BridgeWindows がこれを掛ける</summary>
    Private Shared Sub MapVirtualHost(core As CoreWebView2)
        If Directory.Exists(WwwRoot) Then
            core.SetVirtualHostNameToFolderMapping(VirtualHost, WwwRoot, CoreWebView2HostResourceAccessKind.Allow)
        End If
    End Sub

    ''' <summary>Debug ビルドで WEBVIEW2_BRIDGE_DEV_URL が設定されていればその URL、それ以外は Nothing</summary>
    Private Shared Function DevServerUrl() As String
#If DEBUG Then
        Dim url = Environment.GetEnvironmentVariable(DevUrlEnvVar)
        If Not String.IsNullOrWhiteSpace(url) Then Return url.Trim()
#End If
        Return Nothing
    End Function

    ''' <summary>
    ''' 配布物を入れ替えた後に WebView2 のキャッシュから古い index.html が出ないよう、index.html の更新日時をクエリに付ける
    ''' （js / css は Vite がファイル名に内容のハッシュを付けるので、index.html さえ新しければ全部新しくなる）
    ''' </summary>
    Private Shared Function StartUrl(root As String) As String
        Dim index = Path.Combine(root, "index.html")
        Dim stamp = If(File.Exists(index), File.GetLastWriteTimeUtc(index).Ticks.ToString(CultureInfo.InvariantCulture), "0")
        Return $"https://{VirtualHost}/index.html?v={stamp}"
    End Function

    Private Sub MainForm_FormClosed(sender As Object, e As FormClosedEventArgs) Handles MyBase.FormClosed
        _windows?.Dispose()
        _bridge?.Dispose()
    End Sub
End Class
