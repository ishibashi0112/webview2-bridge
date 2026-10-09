Option Strict On
Imports System
Imports System.Windows.Forms

Friend Module Program
    <STAThread>
    Friend Sub Main()
        ' 配布物を MyApp\ にまとめたとき（MyApp.Host.vbproj の AppFilesDir）、WebView2Loader.dll をそこから読む。WebView2 のほかの呼び出しより前に
        MainForm.ConfigureWebView2Loader()
        Application.EnableVisualStyles()
        Application.SetCompatibleTextRenderingDefault(False)
        Application.Run(New MainForm())
    End Sub
End Module
