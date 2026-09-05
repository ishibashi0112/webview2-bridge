Option Strict On

Imports System
Imports System.Collections.Generic
Imports System.Linq
Imports System.Threading.Tasks
Imports WebView2Bridge.Contract

''' <summary>
''' "parts.*" の実装。Phase 3 では固定データのスタブ。
''' 将来ここで SqlClient / Oracle.ManagedDataAccess を使い、DB と話す。
''' 振る舞いは apps/web/src/mock/handlers.ts と揃えておく（ブラウザ単体と WebView2 内で同じ動きにする）。
''' </summary>
Public Class PartsApi
    Implements IPartsApi

    Private ReadOnly _events As BridgeEvents

    Private Shared ReadOnly Data As Part() = {
        New Part With {.PartNo = "A-001", .Name = "Bolt M6x20", .Qty = 120, .UpdatedAt = "2026-01-05T09:00:00Z"},
        New Part With {.PartNo = "A-002", .Name = "Nut M6", .Qty = 80, .UpdatedAt = "2026-01-06T09:00:00Z"},
        New Part With {.PartNo = "A-003", .Name = "Washer M6", .Qty = 0, .UpdatedAt = "2026-01-07T09:00:00Z"},
        New Part With {.PartNo = "B-100", .Name = "Bearing 6201", .Qty = 12, .UpdatedAt = "2026-02-01T09:00:00Z"},
        New Part With {.PartNo = "B-101", .Name = "Bearing 6202", .Qty = 7, .UpdatedAt = "2026-02-02T09:00:00Z"},
        New Part With {.PartNo = "C-500", .Name = "Gasket 50mm", .Qty = 300, .UpdatedAt = "2026-03-01T09:00:00Z"},
        New Part With {.PartNo = "C-501", .Name = "Gasket 60mm", .Qty = 250, .UpdatedAt = "2026-03-02T09:00:00Z"},
        New Part With {.PartNo = "D-900", .Name = "Motor 200W", .Qty = 3, .UpdatedAt = "2026-04-01T09:00:00Z"}
    }

    ''' <param name="events">進捗などのイベント発行先。Nothing なら発行しない</param>
    Public Sub New(events As BridgeEvents)
        _events = events
    End Sub

    Public Async Function Search(req As PartsSearchRequest) As Task(Of PartsSearchResponse) Implements IPartsApi.Search
        ' "error" で検索するとホスト側例外（-32000）になることを確認できる
        If String.Equals(req.Keyword, "error", StringComparison.OrdinalIgnoreCase) Then
            Throw New InvalidOperationException("Simulated failure")
        End If

        Progress(0, "検索開始")
        Await Task.Delay(150).ConfigureAwait(False)
        Progress(50, $"""{req.Keyword}"" を検索中")
        Await Task.Delay(150).ConfigureAwait(False)

        Dim kw = req.Keyword.ToLowerInvariant()
        Dim hit = Data.Where(Function(p) p.PartNo.ToLowerInvariant().Contains(kw) OrElse p.Name.ToLowerInvariant().Contains(kw)).ToList()
        Progress(100, $"{hit.Count} 件")

        Dim take = If(req.Limit.HasValue, req.Limit.Value, hit.Count)
        Return New PartsSearchResponse With {.Items = hit.Take(take).ToList()}
    End Function

    Private Sub Progress(percent As Double, message As String)
        If _events Is Nothing Then Return
        _events.Progress(New ProgressEvent With {.Percent = percent, .Message = message})
    End Sub
End Class
