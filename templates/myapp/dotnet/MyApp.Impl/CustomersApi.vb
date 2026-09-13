Option Strict On

Imports System
Imports System.Collections.Generic
Imports System.Linq
Imports System.Threading.Tasks
Imports MyApp.Contract

''' <summary>
''' "customers.*" の実装。人間が書く VB はこのようなクラスと MainForm だけ。
''' ここで SqlClient / Oracle.ManagedDataAccess 等を使い DB と話す。
''' 振る舞いは web/src/bridge.ts のモックと揃えておく（ブラウザ単体と WebView2 内で同じ動きにする）。
''' </summary>
Public Class CustomersApi
    Implements ICustomersApi

    Private ReadOnly _events As BridgeEvents

    Private Shared ReadOnly Data As Customer() = {
        New Customer With {.Id = "1", .Name = "山田商事"},
        New Customer With {.Id = "2", .Name = "佐藤工業"},
        New Customer With {.Id = "3", .Name = "鈴木電機"}
    }

    ''' <param name="events">進捗などのイベント発行先。Nothing なら発行しない</param>
    Public Sub New(events As BridgeEvents)
        _events = events
    End Sub

    Public Async Function List(req As CustomersListRequest) As Task(Of CustomersListResponse) Implements ICustomersApi.List
        _events?.Progress(New ProgressEvent With {.Percent = 0})
        Await Task.Delay(100).ConfigureAwait(False)
        Dim kw = If(req.Keyword, "")
        Dim hit = Data.Where(Function(c) c.Name.Contains(kw)).ToList()
        _events?.Progress(New ProgressEvent With {.Percent = 100})
        Return New CustomersListResponse With {.Items = hit}
    End Function
End Class
