Option Strict On

Namespace Global.WebView2Bridge.Runtime

    ''' <summary>
    ''' Host → Web の通知（JSON-RPC notification）を送る口。
    ''' Contract は WebView2 に依存しないので、実体は Host 側（WebViewBridge）が実装する。
    ''' 生成される BridgeEvents はこれを通して "event.&lt;name&gt;" を発行する。
    ''' </summary>
    Public Interface IBridgeEmitter
        ''' <param name="method">"event.progress" のような通知名</param>
        ''' <param name="params">ペイロード（生成 DTO）。Nothing 可</param>
        Sub Emit(method As String, params As Object)
    End Interface

End Namespace
