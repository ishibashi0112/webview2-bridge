Imports System.IO
Imports System.Windows.Forms
Imports Microsoft.Web.WebView2.Core
Imports Microsoft.Web.WebView2.WinForms
Imports Wvbridge.Contract
Imports Wvbridge.Impl

''' <summary>
''' 窓 + WebView2 + Dispatcher だけを持つホスト Form。
''' - Debug かつ環境変数 WVBRIDGE_DEV_URL があればそこへ Navigate（通常 http://localhost:5173）
''' - それ以外は exe 隣の wwwroot を https://app.local/ にマップして index.html を開く
''' - F12 で DevTools
''' </summary>
Public Class MainForm
    Inherits Form

    Public Const VirtualHostName As String = "app.local"
    Public Const DevUrlEnvironmentVariable As String = "WVBRIDGE_DEV_URL"

    Private ReadOnly _webView As New WebView2() With {.Dock = DockStyle.Fill}
    Private ReadOnly _dispatcher As New Dispatcher()
    Private _bridge As WebViewBridge

    Public Sub New()
        Text = "wvbridge"
        ClientSize = New Drawing.Size(1024, 720)
        StartPosition = FormStartPosition.CenterScreen
        Controls.Add(_webView)
    End Sub

    ''' <summary>exe 隣の wwwroot（vite build の dist のコピー先）</summary>
    Public Shared ReadOnly Property WwwRootPath As String
        Get
            Return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot")
        End Get
    End Property

    Protected Overrides Async Sub OnLoad(e As EventArgs)
        MyBase.OnLoad(e)
        Try
            Await _webView.EnsureCoreWebView2Async()
            Dim core = _webView.CoreWebView2
            core.Settings.AreDevToolsEnabled = True
            core.Settings.IsStatusBarEnabled = False

            ' ブリッジと実装の配線（人間が書く VB はここと Impl だけ）
            _bridge = New WebViewBridge(_webView, _dispatcher)
            _bridge.Attach()
            Dim events As New BridgeEvents(_bridge)
            _dispatcher.Register(New PartsApi(events))

            Dim devUrl = GetDevUrl()
            If devUrl IsNot Nothing Then
                Text &= " [dev: " & devUrl & "]"
                core.Navigate(devUrl)
            Else
                If Not File.Exists(Path.Combine(WwwRootPath, "index.html")) Then
                    MessageBox.Show(Me,
                        "wwwroot/index.html が見つかりません。" & Environment.NewLine &
                        "  " & WwwRootPath & Environment.NewLine & Environment.NewLine &
                        "`pnpm build:web` を実行してから Wvbridge.Host をビルドし直してください（dist が wwwroot にコピーされます）。" & Environment.NewLine &
                        "開発中は環境変数 " & DevUrlEnvironmentVariable & "=http://localhost:5173 を設定して起動すると Vite の dev サーバーに接続します。",
                        "wvbridge", MessageBoxButtons.OK, MessageBoxIcon.Warning)
                End If
                core.SetVirtualHostNameToFolderMapping(VirtualHostName, WwwRootPath, CoreWebView2HostResourceAccessKind.Allow)
                core.Navigate("https://" & VirtualHostName & "/index.html")
            End If
        Catch ex As Exception
            MessageBox.Show(Me, "WebView2 の初期化に失敗しました。WebView2 Runtime がインストールされているか確認してください。" &
                            Environment.NewLine & Environment.NewLine & ex.ToString(),
                            "wvbridge", MessageBoxButtons.OK, MessageBoxIcon.Error)
        End Try
    End Sub

    Private Shared Function GetDevUrl() As String
#If DEBUG Then
        Dim url = Environment.GetEnvironmentVariable(DevUrlEnvironmentVariable)
        If Not String.IsNullOrWhiteSpace(url) Then Return url.Trim()
#End If
        Return Nothing
    End Function

    Protected Overrides Sub OnFormClosed(e As FormClosedEventArgs)
        _bridge?.Dispose()
        MyBase.OnFormClosed(e)
    End Sub
End Class
