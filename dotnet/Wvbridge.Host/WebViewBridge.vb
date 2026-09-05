Imports System.Windows.Forms
Imports Microsoft.Web.WebView2.Core
Imports Microsoft.Web.WebView2.WinForms
Imports Wvbridge.Contract

''' <summary>
''' WebView2 コントロールと Dispatcher をつなぐ。
''' Web → Host: WebMessageReceived → Dispatcher.HandleAsync → PostWebMessageAsJson
''' Host → Web: Emit(method, payload) → JSON-RPC notification を PostWebMessageAsJson
''' PostWebMessageAsJson は UI スレッドでしか呼べないので、別スレッドからの Emit は BeginInvoke で戻す。
''' </summary>
Public Class WebViewBridge
    Implements IEventSink
    Implements IDisposable

    Private ReadOnly _webView As WebView2
    Private ReadOnly _dispatcher As Dispatcher
    Private _attached As Boolean

    Public Sub New(webView As WebView2, dispatcher As Dispatcher)
        If webView Is Nothing Then Throw New ArgumentNullException(NameOf(webView))
        If dispatcher Is Nothing Then Throw New ArgumentNullException(NameOf(dispatcher))
        _webView = webView
        _dispatcher = dispatcher
    End Sub

    Public ReadOnly Property Dispatcher As Dispatcher
        Get
            Return _dispatcher
        End Get
    End Property

    ''' <summary>EnsureCoreWebView2Async の完了後に呼ぶ。WebMessageReceived の購読を開始する。</summary>
    Public Sub Attach()
        If _attached Then Return
        If _webView.CoreWebView2 Is Nothing Then
            Throw New InvalidOperationException("CoreWebView2 is not initialized. Await EnsureCoreWebView2Async() first.")
        End If
        AddHandler _webView.CoreWebView2.WebMessageReceived, AddressOf OnWebMessageReceived
        _attached = True
    End Sub

    ''' <summary>Host → Web の通知を送る（IEventSink）。任意のスレッドから呼べる。</summary>
    Public Sub Emit(method As String, payload As Object) Implements IEventSink.Emit
        Post(JsonRpc.Notification(method, payload, _dispatcher.Serializer))
    End Sub

    ' WinForms の SynchronizationContext 上で Await するので、続きは UI スレッドに戻る
    Private Async Sub OnWebMessageReceived(sender As Object, e As CoreWebView2WebMessageReceivedEventArgs)
        Try
            ' Web 側は postMessage(obj) でオブジェクトを送る → ここでは JSON 文字列として受ける
            Dim responseJson = Await _dispatcher.HandleAsync(e.WebMessageAsJson)
            Post(responseJson)
        Catch ex As Exception
            ' HandleAsync は投げない設計だが、万一の場合もホストを落とさない
            Diagnostics.Debug.WriteLine("[wvbridge] failed to handle web message: " & ex.ToString())
        End Try
    End Sub

    Private Sub Post(json As String)
        If _webView.IsDisposed OrElse Not _attached Then Return
        If _webView.InvokeRequired Then
            _webView.BeginInvoke(New Action(Of String)(AddressOf PostOnUiThread), json)
        Else
            PostOnUiThread(json)
        End If
    End Sub

    Private Sub PostOnUiThread(json As String)
        If _webView.IsDisposed Then Return
        Dim core = _webView.CoreWebView2
        If core Is Nothing Then Return
        core.PostWebMessageAsJson(json)
    End Sub

    Public Sub Dispose() Implements IDisposable.Dispose
        If _attached AndAlso Not _webView.IsDisposed AndAlso _webView.CoreWebView2 IsNot Nothing Then
            RemoveHandler _webView.CoreWebView2.WebMessageReceived, AddressOf OnWebMessageReceived
        End If
        _attached = False
    End Sub
End Class
