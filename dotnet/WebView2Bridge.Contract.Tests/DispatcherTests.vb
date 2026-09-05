Option Strict On

Imports System
Imports System.Collections.Generic
Imports System.Threading.Tasks
Imports Newtonsoft.Json.Linq
Imports WebView2Bridge.Contract
Imports Xunit

Public Class DispatcherTests

    ''' <summary>IPartsApi のテスト用実装</summary>
    Private Class FakePartsApi
        Implements IPartsApi

        Public LastRequest As PartsSearchRequest
        Public Behavior As Func(Of PartsSearchRequest, Task(Of PartsSearchResponse))

        Public Function Search(req As PartsSearchRequest) As Task(Of PartsSearchResponse) Implements IPartsApi.Search
            LastRequest = req
            If Behavior IsNot Nothing Then Return Behavior(req)
            Dim res As New PartsSearchResponse()
            res.Items.Add(New Part With {.PartNo = "A-001", .Name = "Bolt", .Qty = 1, .UpdatedAt = "2026-01-05T09:00:00Z"})
            Return Task.FromResult(res)
        End Function
    End Class

    ''' <summary>JObject.Parse は日付文字列を Date に変換してしまうので、ブリッジと同じ設定で読む</summary>
    Private Shared Function P(json As String) As JObject
        Return CType(JsonRpc.ParseToken(json), JObject)
    End Function

    Private Shared Function Create(Optional api As FakePartsApi = Nothing) As Dispatcher
        Dim d As New Dispatcher()
        d.Register(If(api, New FakePartsApi()))
        Return d
    End Function

    <Fact>
    Public Async Function Result_RoundTrip() As Task
        Dim api As New FakePartsApi()
        Dim d = Create(api)
        Dim raw = Await d.HandleAsync("{""jsonrpc"":""2.0"",""id"":""abc-1"",""method"":""parts.search"",""params"":{""keyword"":""bo"",""limit"":5}}")
        Assert.Contains("""updatedAt"":""2026-01-05T09:00:00Z""", raw)
        Dim res = P(raw)

        Assert.Equal("2.0", res.Value(Of String)("jsonrpc"))
        Assert.Equal("abc-1", res.Value(Of String)("id"))
        Assert.Null(res("error"))
        Assert.Equal("bo", api.LastRequest.Keyword)
        Assert.Equal(5, api.LastRequest.Limit)
        Dim items = CType(res("result")("items"), JArray)
        Assert.Single(items)
        Assert.Equal("A-001", items(0).Value(Of String)("partNo"))
        ' 日付は文字列のまま（Date に変換されて書式が変わらない）
        Assert.Equal("2026-01-05T09:00:00Z", items(0).Value(Of String)("updatedAt"))
    End Function

    <Fact>
    Public Async Function Numeric_Id_Is_Preserved() As Task
        Dim res = P(Await Create().HandleAsync("{""jsonrpc"":""2.0"",""id"":7,""method"":""parts.search"",""params"":{""keyword"":""x""}}"))
        Assert.Equal(JTokenType.Integer, res("id").Type)
        Assert.Equal(7, res.Value(Of Integer)("id"))
    End Function

    <Fact>
    Public Async Function Missing_Params_Is_Treated_As_Empty_Object() As Task
        Dim api As New FakePartsApi()
        Dim res = P(Await Create(api).HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search""}"))
        Assert.Null(res("error"))
        Assert.NotNull(api.LastRequest)
        Assert.Null(api.LastRequest.Keyword)
        Assert.False(api.LastRequest.Limit.HasValue)
    End Function

    <Fact>
    Public Async Function Method_Not_Found() As Task
        Dim res = P(Await Create().HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.nope"",""params"":{}}"))
        Assert.Equal(JsonRpcErrorCodes.MethodNotFound, res("error").Value(Of Integer)("code"))
        Assert.Contains("parts.nope", res("error").Value(Of String)("message"))
        Assert.Equal(1, res.Value(Of Integer)("id"))
    End Function

    <Fact>
    Public Async Function Parse_Error_Has_Null_Id() As Task
        Dim res = P(Await Create().HandleAsync("{not json"))
        Assert.Equal(JsonRpcErrorCodes.ParseError, res("error").Value(Of Integer)("code"))
        Assert.Equal(JTokenType.Null, res("id").Type)
    End Function

    <Fact>
    Public Async Function Invalid_Request_When_Not_An_Object() As Task
        Dim res = P(Await Create().HandleAsync("[1,2,3]"))
        Assert.Equal(JsonRpcErrorCodes.InvalidRequest, res("error").Value(Of Integer)("code"))
    End Function

    <Fact>
    Public Async Function Invalid_Request_When_Method_Missing() As Task
        Dim res = P(Await Create().HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""params"":{}}"))
        Assert.Equal(JsonRpcErrorCodes.InvalidRequest, res("error").Value(Of Integer)("code"))
        Assert.Equal(1, res.Value(Of Integer)("id"))
    End Function

    <Fact>
    Public Async Function Invalid_Params_When_Deserialization_Fails() As Task
        Dim res = P(Await Create().HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search"",""params"":{""keyword"":""x"",""limit"":""abc""}}"))
        Assert.Equal(JsonRpcErrorCodes.InvalidParams, res("error").Value(Of Integer)("code"))
        Dim res2 = P(Await Create().HandleAsync("{""jsonrpc"":""2.0"",""id"":2,""method"":""parts.search"",""params"":[1]}"))
        Assert.Equal(JsonRpcErrorCodes.InvalidParams, res2("error").Value(Of Integer)("code"))
    End Function

    <Fact>
    Public Async Function Unhandled_Exception_Becomes_ServerError_With_Type_Name() As Task
        Dim api As New FakePartsApi With {
            .Behavior = Function(req) As Task(Of PartsSearchResponse)
                            Throw New InvalidOperationException("boom")
                        End Function
        }
        Dim res = P(Await Create(api).HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search"",""params"":{""keyword"":""x""}}"))
        Assert.Equal(JsonRpcErrorCodes.ServerError, res("error").Value(Of Integer)("code"))
        Assert.Equal("boom", res("error").Value(Of String)("message"))
        Assert.Equal("System.InvalidOperationException", res("error").Value(Of String)("data"))
    End Function

    <Fact>
    Public Async Function Async_Exception_After_Await_Is_Also_Converted() As Task
        Dim api As New FakePartsApi With {
            .Behavior = Async Function(req)
                            Await Task.Delay(1)
                            Throw New ApplicationException("later")
                        End Function
        }
        Dim res = P(Await Create(api).HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search"",""params"":{""keyword"":""x""}}"))
        Assert.Equal(JsonRpcErrorCodes.ServerError, res("error").Value(Of Integer)("code"))
        Assert.Equal("later", res("error").Value(Of String)("message"))
    End Function

    <Fact>
    Public Async Function JsonRpcException_Uses_Its_Own_Code_And_Data() As Task
        Dim api As New FakePartsApi With {
            .Behavior = Function(req) As Task(Of PartsSearchResponse)
                            Throw New JsonRpcException(-32010, "not allowed", New With {.reason = "role"})
                        End Function
        }
        Dim res = P(Await Create(api).HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search"",""params"":{""keyword"":""x""}}"))
        Assert.Equal(-32010, res("error").Value(Of Integer)("code"))
        Assert.Equal("not allowed", res("error").Value(Of String)("message"))
        Assert.Equal("role", res("error")("data").Value(Of String)("reason"))
    End Function

    <Fact>
    Public Async Function Notification_Without_Id_Returns_Nothing() As Task
        Dim api As New FakePartsApi()
        Dim res = Await Create(api).HandleAsync("{""jsonrpc"":""2.0"",""method"":""parts.search"",""params"":{""keyword"":""x""}}")
        Assert.Null(res)
        Assert.NotNull(api.LastRequest) ' 処理自体は行われる
    End Function

    <Fact>
    Public Sub Optional_Properties_Are_Omitted_When_Nothing()
        Dim d = Create()
        Dim json = d.BuildNotification("event.progress", New ProgressEvent With {.Percent = 50})
        Dim o = P(json)
        Assert.Equal("event.progress", o.Value(Of String)("method"))
        Assert.Null(o("id"))
        Assert.Equal(50.0, o("params").Value(Of Double)("percent"))
        Assert.Null(o("params")("message")) ' キー自体が無い（zod の .optional() が null を拒否するため）
        Assert.DoesNotContain("message", json)
    End Sub

    <Fact>
    Public Sub Required_Reference_Properties_Are_Emitted_As_Null()
        Dim d = Create()
        Dim json = d.BuildNotification("x", New Part With {.PartNo = "p"})
        Assert.Contains("""name"":null", json)
    End Sub

    <Fact>
    Public Sub Generated_Metadata_Lists_Methods_And_Events()
        Assert.Equal("parts.search", Assert.Single(Dispatcher.MethodNames))
        Assert.Equal("event.progress", Assert.Single(BridgeEvents.EventNames))
        Dim d = Create()
        Assert.Contains("parts.search", d.RegisteredMethods)
    End Sub

    <Fact>
    Public Sub BridgeEvents_Calls_Emitter_With_Full_Method_Name()
        Dim calls As New List(Of Tuple(Of String, Object))()
        Dim emitter As New DelegateEmitter(Sub(m, p) calls.Add(Tuple.Create(m, p)))
        Dim ev As New BridgeEvents(emitter)
        ev.Progress(New ProgressEvent With {.Percent = 1})
        Assert.Single(calls)
        Assert.Equal("event.progress", calls(0).Item1)
        Assert.IsType(Of ProgressEvent)(calls(0).Item2)
    End Sub

    Private Class DelegateEmitter
        Implements IBridgeEmitter

        Private ReadOnly _action As Action(Of String, Object)

        Public Sub New(action As Action(Of String, Object))
            _action = action
        End Sub

        Public Sub Emit(method As String, params As Object) Implements IBridgeEmitter.Emit
            _action(method, params)
        End Sub
    End Class
End Class
