# WebView2Bridge.WinForms

WinForms glue for [webview2-bridge](https://github.com/ishibashi0112/webview2-bridge).

`WebViewBridge` connects a `Microsoft.Web.WebView2.WinForms.WebView2` control to a `WebView2Bridge.Runtime.Dispatcher`:

- Web → Host: `WebMessageReceived` → `Dispatcher.HandleAsync` → `PostWebMessageAsJson`
- Host → Web: `Emit(method, payload)` (implements `IBridgeEmitter`) → JSON-RPC notification → `PostWebMessageAsJson`,
  marshalled to the UI thread so it can be called from any thread.

```vb
Await WebView.EnsureCoreWebView2Async()
Dim dispatcher As New Dispatcher()
Dim bridge As New WebViewBridge(WebView, dispatcher)
Dim events As New BridgeEvents(bridge)              ' generated
dispatcher.Register(New PartsApi(events))           ' generated extension method
bridge.Attach()
```

Targets `net48`. Depends on `WebView2Bridge.Runtime` and `Microsoft.Web.WebView2`.
The front-end counterpart is `@ishibashi0112/webview2-bridge-client` on npm.
