Imports System.Threading.Tasks
Imports Microsoft.VisualStudio.TestTools.UnitTesting
Imports Newtonsoft.Json.Linq
Imports Wvbridge.Contract

<TestClass>
Public Class DispatcherTests

    Private _api As FakePartsApi
    Private _dispatcher As Dispatcher

    <TestInitialize>
    Public Sub Setup()
        _api = New FakePartsApi()
        _dispatcher = New Dispatcher()
        _dispatcher.Register(_api)
    End Sub

    Private Async Function HandleAsync(requestJson As String) As Task(Of JObject)
        Dim responseJson = Await _dispatcher.HandleAsync(requestJson)
        Return JsonRpc.ParseObject(responseJson)
    End Function

    <TestMethod>
    Public Sub Register_registers_generated_methods()
        CollectionAssert.AreEquivalent({"parts.search"}, _dispatcher.Methods.ToArray())
    End Sub

    <TestMethod>
    Public Async Function Success_returns_result_with_same_id() As Task
        Dim res = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":""abc-1"",""method"":""parts.search"",""params"":{""keyword"":""bo"",""limit"":5}}")

        Assert.AreEqual("2.0", res.Value(Of String)("jsonrpc"))
        Assert.AreEqual("abc-1", res.Value(Of String)("id"))
        Assert.IsNull(res("error"))
        Assert.AreEqual("bo", _api.LastRequest.Keyword)
        Assert.AreEqual(5, _api.LastRequest.Limit)

        Dim items = CType(res("result")("items"), JArray)
        Assert.AreEqual(1, items.Count)
        Assert.AreEqual("P-001", items(0).Value(Of String)("partNo"))
        Assert.AreEqual(10, items(0).Value(Of Integer)("qty"))
    End Function

    <TestMethod>
    Public Async Function Numeric_id_is_echoed_as_number() As Task
        Dim res = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":42,""method"":""parts.search"",""params"":{""keyword"":""x""}}")
        Assert.AreEqual(JTokenType.Integer, res("id").Type)
        Assert.AreEqual(42, res.Value(Of Integer)("id"))
    End Function

    <TestMethod>
    Public Async Function Optional_value_type_is_nothing_when_omitted() As Task
        Await HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search"",""params"":{""keyword"":""x""}}")
        Assert.IsFalse(_api.LastRequest.Limit.HasValue)
    End Function

    <TestMethod>
    Public Async Function Date_strings_round_trip_unchanged() As Task
        ' Newtonsoft の自動 DateTime 変換が切れていること（ISO 8601 文字列のまま往復する）
        Dim res = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search"",""params"":{""keyword"":""2026-01-01T00:00:00Z""}}")
        Assert.AreEqual("2026-01-01T00:00:00Z", _api.LastRequest.Keyword)
        Assert.AreEqual(JTokenType.String, res("result")("items")(0)("updatedAt").Type)
        Assert.AreEqual("2026-01-02T03:04:05+09:00", res("result")("items")(0).Value(Of String)("updatedAt"))
    End Function

    <TestMethod>
    Public Async Function Parse_error_is_32700_with_null_id() As Task
        Dim res = Await HandleAsync("{ this is not json")
        Assert.AreEqual(JsonRpcErrorCodes.ParseError, res("error").Value(Of Integer)("code"))
        Assert.AreEqual(JTokenType.Null, res("id").Type)
    End Function

    <TestMethod>
    Public Async Function Non_object_message_is_32700() As Task
        Dim res = Await HandleAsync("""just a string""")
        Assert.AreEqual(JsonRpcErrorCodes.ParseError, res("error").Value(Of Integer)("code"))
    End Function

    <TestMethod>
    Public Async Function Missing_jsonrpc_or_method_is_32600() As Task
        Dim res1 = Await HandleAsync("{""id"":1,""method"":""parts.search"",""params"":{}}")
        Assert.AreEqual(JsonRpcErrorCodes.InvalidRequest, res1("error").Value(Of Integer)("code"))
        Assert.AreEqual(1, res1.Value(Of Integer)("id"))

        Dim res2 = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":2,""params"":{}}")
        Assert.AreEqual(JsonRpcErrorCodes.InvalidRequest, res2("error").Value(Of Integer)("code"))

        Dim res3 = Await HandleAsync("{""jsonrpc"":""1.0"",""id"":3,""method"":""parts.search""}")
        Assert.AreEqual(JsonRpcErrorCodes.InvalidRequest, res3("error").Value(Of Integer)("code"))
    End Function

    <TestMethod>
    Public Async Function Unknown_method_is_32601() As Task
        Dim res = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.nope"",""params"":{}}")
        Assert.AreEqual(JsonRpcErrorCodes.MethodNotFound, res("error").Value(Of Integer)("code"))
        StringAssert.Contains(res("error").Value(Of String)("message"), "parts.nope")
        Assert.IsNull(_api.LastRequest)
    End Function

    <TestMethod>
    Public Async Function Missing_params_is_32602() As Task
        Dim res = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search""}")
        Assert.AreEqual(JsonRpcErrorCodes.InvalidParams, res("error").Value(Of Integer)("code"))
        Assert.IsNull(_api.LastRequest)
    End Function

    <TestMethod>
    Public Async Function Wrongly_typed_params_is_32602() As Task
        Dim res = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search"",""params"":{""keyword"":""x"",""limit"":""not-a-number""}}")
        Assert.AreEqual(JsonRpcErrorCodes.InvalidParams, res("error").Value(Of Integer)("code"))
    End Function

    <TestMethod>
    Public Async Function InvalidParamsException_from_implementation_is_32602() As Task
        _api.ThrowOnSearch = New InvalidParamsException("keyword is required")
        Dim res = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":1,""method"":""parts.search"",""params"":{""keyword"":""""}}")
        Assert.AreEqual(JsonRpcErrorCodes.InvalidParams, res("error").Value(Of Integer)("code"))
        StringAssert.Contains(res("error").Value(Of String)("message"), "keyword is required")
    End Function

    <TestMethod>
    Public Async Function Implementation_exception_is_32000_with_type_name_in_data() As Task
        _api.ThrowOnSearch = New InvalidOperationException("db down")
        Dim res = Await HandleAsync("{""jsonrpc"":""2.0"",""id"":""x"",""method"":""parts.search"",""params"":{""keyword"":""x""}}")
        Assert.AreEqual(JsonRpcErrorCodes.ServerError, res("error").Value(Of Integer)("code"))
        Assert.AreEqual("db down", res("error").Value(Of String)("message"))
        Assert.AreEqual("System.InvalidOperationException", res("error").Value(Of String)("data"))
        Assert.AreEqual("x", res.Value(Of String)("id"))
        Assert.IsNull(res("result"))
    End Function

    <TestMethod>
    Public Sub Notification_has_method_and_params_but_no_id()
        Dim json = JsonRpc.Notification("event.progress", New ProgressEvent With {.Percent = 50, .Message = "half"}, JsonRpc.CreateSerializer())
        Dim msg = JsonRpc.ParseObject(json)
        Assert.AreEqual("2.0", msg.Value(Of String)("jsonrpc"))
        Assert.AreEqual("event.progress", msg.Value(Of String)("method"))
        Assert.IsNull(msg("id"))
        Assert.AreEqual(50.0, msg("params").Value(Of Double)("percent"))
        Assert.AreEqual("half", msg("params").Value(Of String)("message"))
    End Sub

    <TestMethod>
    Public Sub BridgeEvents_emits_typed_event_through_sink()
        Dim sink As New RecordingSink()
        Dim events As New BridgeEvents(sink)
        events.Progress(New ProgressEvent With {.Percent = 100})
        Assert.AreEqual("event.progress", sink.LastMethod)
        Assert.AreEqual(100.0, CType(sink.LastPayload, ProgressEvent).Percent)
    End Sub

    Private Class RecordingSink
        Implements IEventSink

        Public Property LastMethod As String
        Public Property LastPayload As Object

        Public Sub Emit(method As String, payload As Object) Implements IEventSink.Emit
            LastMethod = method
            LastPayload = payload
        End Sub
    End Class
End Class
