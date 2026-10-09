Option Strict On

Imports System
Imports System.Diagnostics
Imports System.Globalization
Imports System.IO
Imports System.Windows.Forms
Imports Microsoft.Web.WebView2.Core
Imports Microsoft.Web.WebView2.WinForms
Imports MyApp.Contract
Imports MyApp.Impl
Imports WebView2Bridge.Runtime
Imports WebView2Bridge.WinForms

''' <summary>
''' 窓 + WebView2 + Dispatcher。人間が書くホスト側はこのファイルと Program.vb だけ（WebViewBridge は gen が Bridge/ に書く）。
'''   Debug かつ環境変数 WEBVIEW2_BRIDGE_DEV_URL があれば Vite dev server へ（通常 http://localhost:5173）
'''   それ以外は wwwroot（exe 隣、または MyApp\ の中）を https://app.local/ にマッピングして index.html を開く
'''   F12（開発者ツール）と F5 / Ctrl+R（再読込）などブラウザのショートカットは開発モード（DevMode）のときだけ有効
''' VS のフォームデザイナは使っていない（コードで WebView2 を Dock=Fill している）。
''' デザイナで部品を足したくなったら MainForm.Designer.vb に分離する。
''' </summary>
Public Class MainForm
    Inherits Form

    Public Const VirtualHost As String = "app.local"
    Public Const DevUrlEnvVar As String = "WEBVIEW2_BRIDGE_DEV_URL"
    Public Const DevModeEnvVar As String = "WEBVIEW2_BRIDGE_DEV"
    ''' <summary>
    ''' 配布物をまとめるフォルダ名（MyApp.Host.vbproj の AppFilesDir、App.config の probing privatePath と同じ名前）。
    ''' AppFilesDir を設定してビルドすると DLL・WebView2Loader.dll・wwwroot はこの中に入り、exe の隣には exe と exe.config だけが残る
    ''' </summary>
    Public Const FilesDirName As String = "MyApp"

    Private ReadOnly WebView As New WebView2() With {.Dock = DockStyle.Fill}
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

    ''' <summary>配布物をまとめるフォルダ（exe 隣の MyApp\）。AppFilesDir を使わないビルドでは存在しない</summary>
    Public Shared ReadOnly Property FilesRoot As String
        Get
            Return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, FilesDirName)
        End Get
    End Property

    ''' <summary>wwwroot の場所。MyApp\wwwroot があればそちら、無ければ exe 隣の wwwroot（どちらの配布の形でも動く）</summary>
    Public Shared ReadOnly Property WwwRoot As String
        Get
            Dim bundled = Path.Combine(FilesRoot, "wwwroot")
            If Directory.Exists(bundled) Then Return bundled
            Return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot")
        End Get
    End Property

    ''' <summary>
    ''' WebView2Loader.dll が MyApp\ にあればそこから読むよう WebView2 に指定する。
    ''' WebView2 のほかの呼び出しより前（Program.Main の最初）に呼ぶ。exe 隣にあるときは何もしない（既定の探索で見つかる）
    ''' </summary>
    Public Shared Sub ConfigureWebView2Loader()
        If File.Exists(Path.Combine(FilesRoot, "WebView2Loader.dll")) Then
            CoreWebView2Environment.SetLoaderDllFolderPath(FilesRoot)
        End If
    End Sub

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
            ' F12（開発者ツール）は開発モードだけ。ブラウザのショートカット（F5 / Ctrl+R の再読込、Ctrl+F、Ctrl+P、Ctrl+± のズーム等）も
            ' 本番では無効にする（再読込は FormClosing を通らないので、未保存の内容が確認なしに消える）。
            ' 画面側の JavaScript の keydown は影響を受けないので、必要なショートカットは画面で実装する
            core.Settings.AreDevToolsEnabled = DevMode
            core.Settings.AreBrowserAcceleratorKeysEnabled = DevMode
            core.Settings.IsStatusBarEnabled = False
            ' window.open / target="_blank" は、ブリッジの無い素の WebView2 窓を開いてしまうので、http(s) は既定のブラウザに渡し、それ以外は止める
            AddHandler core.NewWindowRequested, AddressOf Core_NewWindowRequested

            ' 契約の実装を Dispatcher に登録する（API を増やしたらここに Register を足す）
            Dim dispatcher As New Dispatcher()
            _bridge = New WebViewBridge(WebView, dispatcher)
            Dim events As New BridgeEvents(_bridge)
            dispatcher.Register(New CustomersApi(events))
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

            Dim devUrl = DevServerUrl()
            If devUrl IsNot Nothing Then
                Text = $"MyApp - dev ({devUrl})"
                core.Navigate(devUrl)
            Else
                Dim root = WwwRoot
                If Not File.Exists(Path.Combine(root, "index.html")) Then
                    ' 無いフォルダを SetVirtualHostNameToFolderMapping に渡すと DirectoryNotFoundException になるので、ここで止める
                    MessageBox.Show(
                        $"wwwroot が見つかりません: {root}{Environment.NewLine}" &
                        "`pnpm build:web` の後に Host をビルドすると web/dist がコピーされます。" & Environment.NewLine &
                        $"開発中は環境変数 {DevUrlEnvVar}=http://localhost:5173 を設定して起動してください。",
                        Text, MessageBoxButtons.OK, MessageBoxIcon.Warning)
                    Return
                End If
                core.SetVirtualHostNameToFolderMapping(VirtualHost, root, CoreWebView2HostResourceAccessKind.Allow)
                core.Navigate(StartUrl(root))
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

    ''' <summary>
    ''' 配布物を入れ替えた後に WebView2 のキャッシュから古い index.html が出ないよう、index.html の更新日時をクエリに付ける
    ''' （js / css は Vite がファイル名に内容のハッシュを付けるので、index.html さえ新しければ全部新しくなる）
    ''' </summary>
    Private Shared Function StartUrl(wwwroot As String) As String
        Dim index = Path.Combine(wwwroot, "index.html")
        Dim stamp = If(File.Exists(index), File.GetLastWriteTimeUtc(index).Ticks.ToString(CultureInfo.InvariantCulture), "0")
        Return $"https://{VirtualHost}/index.html?v={stamp}"
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
