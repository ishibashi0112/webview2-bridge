Option Strict On

Imports System
Imports System.IO
Imports System.Windows.Forms
Imports Microsoft.Web.WebView2.Core
Imports Microsoft.Web.WebView2.WinForms
Imports MyApp.Contract
Imports MyApp.Impl
Imports WebView2Bridge.Runtime
Imports WebView2Bridge.WinForms

''' <summary>
''' 窓 + WebView2 + Dispatcher。人間が書くホスト側はこのファイルだけ（WebViewBridge は gen が Bridge/ に書く）。
'''   Debug かつ環境変数 WEBVIEW2_BRIDGE_DEV_URL があれば Vite dev server へ（通常 http://localhost:5173）
'''   それ以外は exe 隣の wwwroot を https://app.local/ にマッピングして index.html を開く
''' VS のフォームデザイナは使っていない（コードで WebView2 を Dock=Fill している）。
''' デザイナで部品を足したくなったら MainForm.Designer.vb に分離する。
''' </summary>
Public Class MainForm
    Inherits Form

    Public Const VirtualHost As String = "app.local"
    Public Const DevUrlEnvVar As String = "WEBVIEW2_BRIDGE_DEV_URL"

    Private ReadOnly WebView As New WebView2() With {.Dock = DockStyle.Fill}
    Private _bridge As WebViewBridge

    Public Sub New()
        Text = "MyApp"
        Width = 1000
        Height = 700
        Controls.Add(WebView)
    End Sub

    Private Async Sub MainForm_Load(sender As Object, e As EventArgs) Handles MyBase.Load
        Try
            ' ユーザーデータは exe 隣ではなく LocalAppData に置く（Program Files 配下でも動くように）
            Dim userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MyApp")
            Dim env = Await CoreWebView2Environment.CreateAsync(Nothing, userDataFolder)
            Await WebView.EnsureCoreWebView2Async(env)

            Dim core = WebView.CoreWebView2
            core.Settings.AreDevToolsEnabled = True ' F12 で DevTools
            core.Settings.IsStatusBarEnabled = False

            ' 契約の実装を Dispatcher に登録する（API を増やしたらここに Register を足す）
            Dim dispatcher As New Dispatcher()
            _bridge = New WebViewBridge(WebView, dispatcher)
            Dim events As New BridgeEvents(_bridge)
            dispatcher.Register(New CustomersApi(events))
            _bridge.Attach()

            Dim devUrl = DevServerUrl()
            If devUrl IsNot Nothing Then
                Text = $"MyApp - dev ({devUrl})"
                core.Navigate(devUrl)
            Else
                Dim wwwroot = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot")
                If Not File.Exists(Path.Combine(wwwroot, "index.html")) Then
                    ' 無いフォルダを SetVirtualHostNameToFolderMapping に渡すと DirectoryNotFoundException になるので、ここで止める
                    MessageBox.Show(
                        $"wwwroot が見つかりません: {wwwroot}{Environment.NewLine}" &
                        "`pnpm build:web` の後に Host をビルドすると web/dist がコピーされます。" & Environment.NewLine &
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

    Private Sub MainForm_FormClosed(sender As Object, e As FormClosedEventArgs) Handles MyBase.FormClosed
        _bridge?.Dispose()
    End Sub
End Class
