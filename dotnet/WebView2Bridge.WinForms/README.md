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

### Sub-windows (opt-in)

`BridgeWindows` lets the page open other screens of the same app in separate windows with the standard
`window.open(url, name, "popup,left=…,top=…,width=…,height=…")` (e.g. to snap two screens side by side).
It handles `NewWindowRequested`: a URL with the same origin as `appUrl` (`https://app.local/`, or the Vite dev server)
opens in a new `Form` + `WebView2` on the same environment and the same `Dispatcher`, passed back via `e.NewWindow`
(so `window.opener`, `close()` and named-window reuse work), placed at the requested position/size
(CSS px × DPI, treated as the outer bounds, fitted into the working area). Other http(s) URLs open in the default browser;
anything else is blocked. All settings are copied from the opener; per-core setup such as the virtual host mapping goes in `configure`.
`Emitter` (`BroadcastEmitter`) sends host → web notifications to every open window. Child windows close with the owner.

```vb
_bridge = New WebViewBridge(WebView, dispatcher)
' instead of your own NewWindowRequested handler; appUrl = the URL the main window navigates to
_windows = New BridgeWindows(env, dispatcher, Me, If(devUrl, "https://app.local/"), AddressOf MapVirtualHost)
_windows.Attach(_bridge)
Dim events As New BridgeEvents(_windows.Emitter)
```

### Save memory while minimized (opt-in)

A minimized `Form` does not tell its `WebView2` anything. `MinimizedMemorySaver` hides the control while the form is
minimized (`IsVisible = False`, so rendering memory can be released) and sets `MemoryUsageTargetLevel = Low`;
restoring sets it back to `Normal` and shows it again (focus is returned if the WebView2 had it). Scripts and messaging keep
running, so pending calls and notifications are not affected. Best effort: how much is released depends on the WebView2 Runtime.
`BridgeWindows` applies it to child windows when the opener has it. It detaches when the form closes.

```vb
MinimizedMemorySaver.Attach(Me, WebView)
```

Targets `net48`. Depends on `WebView2Bridge.Runtime` and `Microsoft.Web.WebView2`.
The front-end counterpart is `@ishibashi0112/webview2-bridge-client` on npm.
