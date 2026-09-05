''' <summary>
''' Host → Web の通知（JSON-RPC notification）を送る先。
''' Contract は WebView2 に依存しないので、実体は Host 側（WebViewBridge）が提供する。
''' </summary>
Public Interface IEventSink
    ''' <param name="method">ワイヤ上の method 名（例: "event.progress"）</param>
    ''' <param name="payload">シリアライズされる params</param>
    Sub Emit(method As String, payload As Object)
End Interface
