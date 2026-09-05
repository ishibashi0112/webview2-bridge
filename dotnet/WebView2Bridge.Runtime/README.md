# WebView2Bridge.Runtime

JSON-RPC 2.0 runtime for [webview2-bridge](https://github.com/ishibashi0112/webview2-bridge):
a thin foundation for hosting a Vite/React UI inside a VB.NET WinForms (.NET Framework 4.8) app via WebView2.

This package contains the parts that do not depend on the contract or on WebView2:

- `Dispatcher` — receives a JSON-RPC request string, deserializes `params` into the generated DTO,
  calls the registered `IXxxApi` implementation and returns the response string.
  Errors are mapped to JSON-RPC codes (-32700 / -32600 / -32601 / -32602 / -32000, or the code of a `JsonRpcException`).
- `JsonRpc` — envelope helpers (`BuildResult`, `BuildError`, `BuildNotification`, `ParseToken`).
  Dates are kept as ISO 8601 strings (`DateParseHandling.None`).
- `IBridgeEmitter` — the host → web notification sink implemented by the host (see `WebView2Bridge.WinForms`).
- `JsonRpcException` / `JsonRpcErrorCodes`.

The generated code (`pnpm gen` from `@ishibashi0112/webview2-bridge-gen`) targets this package:
it emits DTO classes, `IXxxApi` interfaces, a `DispatcherExtensions.Register(dispatcher, api)` extension method
and a `BridgeEvents` helper into your own Contract project, which references `WebView2Bridge.Runtime`.

```vb
Dim dispatcher As New Dispatcher()
dispatcher.Register(New PartsApi(events))          ' generated extension method
Dim responseJson = Await dispatcher.HandleAsync(requestJson)
```

Targets `netstandard2.0`; works on .NET Framework 4.8. Depends on Newtonsoft.Json.
