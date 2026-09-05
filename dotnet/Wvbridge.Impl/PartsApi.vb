Imports System.Linq
Imports System.Threading.Tasks
Imports Wvbridge.Contract

''' <summary>
''' `parts.*` の実装。Phase 3 では固定データのスタブ。
''' 将来ここで DB / サーバーと話す。UI（WebView2）のことは知らない。
''' </summary>
Public Class PartsApi
    Implements IPartsApi

    Private ReadOnly _events As BridgeEvents

    Private Shared ReadOnly StubParts As Part() = {
        New Part With {.PartNo = "P-0001", .Name = "六角ボルト M6x20", .Qty = 1200, .UpdatedAt = "2026-08-30T09:12:00+09:00"},
        New Part With {.PartNo = "P-0002", .Name = "六角ナット M6", .Qty = 3400, .UpdatedAt = "2026-08-30T09:12:00+09:00"},
        New Part With {.PartNo = "P-0003", .Name = "平ワッシャー M6", .Qty = 5000, .UpdatedAt = "2026-08-28T15:40:00+09:00"},
        New Part With {.PartNo = "P-0010", .Name = "ベアリング 6203ZZ", .Qty = 86, .UpdatedAt = "2026-09-01T11:05:00+09:00"},
        New Part With {.PartNo = "P-0011", .Name = "ベアリング 6204ZZ", .Qty = 42, .UpdatedAt = "2026-09-01T11:05:00+09:00"},
        New Part With {.PartNo = "P-0020", .Name = "Oリング P10", .Qty = 900, .UpdatedAt = "2026-07-14T08:00:00+09:00"},
        New Part With {.PartNo = "P-0021", .Name = "Oリング P14", .Qty = 650, .UpdatedAt = "2026-07-14T08:00:00+09:00"},
        New Part With {.PartNo = "P-0030", .Name = "ステッピングモーター 42mm", .Qty = 12, .UpdatedAt = "2026-09-03T17:30:00+09:00"}
    }

    ''' <param name="events">進捗などのイベント発行先。Nothing なら発行しない</param>
    Public Sub New(events As BridgeEvents)
        _events = events
    End Sub

    Public Async Function Search(request As PartsSearchRequest) As Task(Of PartsSearchResponse) Implements IPartsApi.Search
        If request Is Nothing OrElse String.IsNullOrEmpty(request.Keyword) Then
            Throw New InvalidParamsException("keyword is required")
        End If

        ' 進捗イベントを数回に分けて発火する（UI 側の受信表示の確認用）
        For Each percent In {10.0, 45.0, 80.0, 100.0}
            Await Task.Delay(120).ConfigureAwait(False)
            _events?.Progress(New ProgressEvent With {
                .Percent = percent,
                .Message = If(percent < 100, "検索中 " & request.Keyword, "完了")
            })
        Next

        If String.Equals(request.Keyword, "error", StringComparison.OrdinalIgnoreCase) Then
            Throw New InvalidOperationException("スタブ: 意図的なサーバーエラー")
        End If

        Dim keyword = request.Keyword
        Dim query = StubParts.Where(Function(p) p.PartNo.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0 OrElse
                                                p.Name.IndexOf(keyword, StringComparison.OrdinalIgnoreCase) >= 0)
        If request.Limit.HasValue Then query = query.Take(request.Limit.Value)

        Return New PartsSearchResponse With {.Items = query.ToList()}
    End Function
End Class
