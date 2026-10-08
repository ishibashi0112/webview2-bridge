Option Strict On

Imports System
Imports System.Diagnostics
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
''' </summary>
Public Class MainForm

    Public Const VirtualHost As String = "app.local"
    Public Const DevUrlEnvVar As String = "WEBVIEW2_BRIDGE_DEV_URL"
    Public Const DevModeEnvVar As String = "WEBVIEW2_BRIDGE_DEV"

    Private _bridge As WebViewBridge

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
            ' window.open / target="_blank" は、ブリッジの無い素の WebView2 窓を開いてしまうので、http(s) は既定のブラウザに渡し、それ以外は止める
            AddHandler core.NewWindowRequested, AddressOf Core_NewWindowRequested

            ' 契約の実装を Dispatcher に登録する
            Dim dispatcher As New Dispatcher()
            _bridge = New WebViewBridge(WebView, dispatcher)
            Dim events As New BridgeEvents(_bridge)
            dispatcher.Register(New PartsApi(events))
            _bridge.Attach()

            Dim devUrl = DevServerUrl()
            If devUrl IsNot Nothing Then
                Text = $"WebView2Bridge.Host - dev ({devUrl})"
                core.Navigate(devUrl)
            Else
                Dim wwwroot = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot")
                If Not File.Exists(Path.Combine(wwwroot, "index.html")) Then
                    ' 無いフォルダを SetVirtualHostNameToFolderMapping に渡すと DirectoryNotFoundException になるので、ここで止める
                    MessageBox.Show(
                        $"wwwroot が見つかりません: {wwwroot}{Environment.NewLine}" &
                        "`pnpm --filter web build` の後に Host をビルドすると dist がコピーされます。" & Environment.NewLine &
                        $"開発中は環境変数 {DevUrlEnvVar}=http://localhost:5173 を設定して起動してください。",
                        Text, MessageBoxButtons.OK, MessageBoxIcon.Warning)
                    Return
                End If
                core.SetVirtualHostNameToFolderMapping(VirtualHost, wwwroot, CoreWebView2HostResourceAccessKind.Allow)
                core.Navigate($"https://{VirtualHost}/index.html")
            End If
        Catch ex As Exception
            MessageBox.Show(ex.ToString(), "WebView2 の初期化に失敗しました", MessageBoxButtons.OK, MessageBoxIcon.Error)
        End Try
    End Sub

    ''' <summary>Debug ビルドで WEBVIEW2_BRIDGE_DEV_URL が設定されていればその URL、それ以外は Nothing</summary>
    Private Shared Function DevServerUrl() As String
#If DEBUG Then
        Dim url = Environment.GetEnvironmentVariable(DevUrlEnvVar)
        If Not String.IsNullOrWhiteSpace(url) Then Return url.Trim()
#End If
        Return Nothing
    End Function

    Private Shared Sub Core_NewWindowRequested(sender As Object, e As CoreWebView2NewWindowRequestedEventArgs)
        e.Handled = True
        ' VB は大文字小文字を区別しないので、ローカル変数を uri と名付けると型 Uri の Shared メンバーが引けなくなる
        Dim target As Uri = Nothing
        If Uri.TryCreate(e.Uri, UriKind.Absolute, target) AndAlso (target.Scheme = Uri.UriSchemeHttp OrElse target.Scheme = Uri.UriSchemeHttps) Then
            Process.Start(New ProcessStartInfo(target.AbsoluteUri) With {.UseShellExecute = True})
        End If
    End Sub

    Private Sub MainForm_FormClosed(sender As Object, e As FormClosedEventArgs) Handles MyBase.FormClosed
        _bridge?.Dispose()
    End Sub
End Class
