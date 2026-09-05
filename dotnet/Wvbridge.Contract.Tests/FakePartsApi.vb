Imports System.Collections.Generic
Imports System.Threading.Tasks
Imports Wvbridge.Contract

''' <summary>テスト用の IPartsApi。受け取った request を記録し、固定の応答を返す。</summary>
Public Class FakePartsApi
    Implements IPartsApi

    Public Property LastRequest As PartsSearchRequest
    Public Property ThrowOnSearch As Exception

    Public Function Search(request As PartsSearchRequest) As Task(Of PartsSearchResponse) Implements IPartsApi.Search
        LastRequest = request
        If ThrowOnSearch IsNot Nothing Then Throw ThrowOnSearch
        Return Task.FromResult(New PartsSearchResponse With {
            .Items = New List(Of Part) From {
                New Part With {.PartNo = "P-001", .Name = "Bolt", .Qty = 10, .UpdatedAt = "2026-01-02T03:04:05+09:00"}
            }
        })
    End Function
End Class
