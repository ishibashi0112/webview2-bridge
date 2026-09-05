Imports System.Collections.Generic
Imports System.Threading.Tasks
Imports Newtonsoft.Json
Imports Newtonsoft.Json.Linq

''' <summary>
''' JSON-RPC 要求を受け、登録された Interface 実装を呼び、応答 JSON を返す。
''' 手書き側（このファイル）は封筒の解釈とエラー変換のみ。method ごとの分岐は
''' Generated/Dispatcher.Generated.vb（pnpm gen）が Register(api) として生成する。
''' WebView2 には依存しない。
''' </summary>
Partial Public Class Dispatcher
    ''' <summary>method 1 つ分のハンドラ。params を受けて result を返す。</summary>
    Public Delegate Function MethodHandler(params As JToken) As Task(Of Object)

    Private ReadOnly _handlers As New Dictionary(Of String, MethodHandler)(StringComparer.Ordinal)
    Private ReadOnly _serializer As JsonSerializer

    Public Sub New()
        Me.New(JsonRpc.CreateSerializer())
    End Sub

    Public Sub New(serializer As JsonSerializer)
        If serializer Is Nothing Then Throw New ArgumentNullException(NameOf(serializer))
        _serializer = serializer
    End Sub

    Public ReadOnly Property Serializer As JsonSerializer
        Get
            Return _serializer
        End Get
    End Property

    ''' <summary>登録済みの method 名一覧（診断用）。</summary>
    Public ReadOnly Property Methods As IEnumerable(Of String)
        Get
            Return _handlers.Keys
        End Get
    End Property

    ''' <summary>method 名にハンドラを登録する。同名は上書き。</summary>
    Protected Sub RegisterHandler(method As String, handler As MethodHandler)
        If String.IsNullOrEmpty(method) Then Throw New ArgumentException("method is required", NameOf(method))
        If handler Is Nothing Then Throw New ArgumentNullException(NameOf(handler))
        _handlers(method) = handler
    End Sub

    ''' <summary>params を要求 DTO に変換する。失敗は -32602 になる。</summary>
    Protected Function DeserializeParams(Of T)(params As JToken) As T
        If params Is Nothing OrElse params.Type = JTokenType.Null OrElse params.Type = JTokenType.Undefined Then
            Throw New InvalidParamsException("params is required")
        End If
        Try
            Return params.ToObject(Of T)(_serializer)
        Catch ex As JsonException
            Throw New InvalidParamsException("params could not be deserialized: " & ex.Message, ex)
        End Try
    End Function

    ''' <summary>
    ''' 要求 JSON を処理して応答 JSON を返す。例外は必ず JSON-RPC エラー応答に変換され、
    ''' この関数自体は投げない。
    ''' </summary>
    Public Async Function HandleAsync(requestJson As String) As Task(Of String)
        Dim id As JToken = Nothing
        Try
            Dim root As JObject
            Try
                root = JsonRpc.ParseObject(requestJson)
            Catch ex As JsonException
                Return JsonRpc.ErrorResponse(Nothing, JsonRpcErrorCodes.ParseError, "Parse error: " & ex.Message, Nothing, _serializer)
            End Try

            id = root("id")
            Dim versionToken = root("jsonrpc")
            Dim methodToken = root("method")
            If versionToken Is Nothing OrElse versionToken.Type <> JTokenType.String OrElse versionToken.ToString() <> JsonRpc.Version _
               OrElse methodToken Is Nothing OrElse methodToken.Type <> JTokenType.String OrElse String.IsNullOrEmpty(methodToken.ToString()) Then
                Return JsonRpc.ErrorResponse(id, JsonRpcErrorCodes.InvalidRequest, "Invalid Request", Nothing, _serializer)
            End If

            Dim method = methodToken.ToString()
            Dim handler As MethodHandler = Nothing
            If Not _handlers.TryGetValue(method, handler) Then
                Return JsonRpc.ErrorResponse(id, JsonRpcErrorCodes.MethodNotFound, "Method not found: " & method, Nothing, _serializer)
            End If

            Dim result = Await handler(root("params")).ConfigureAwait(False)
            Return JsonRpc.SuccessResponse(id, result, _serializer)
        Catch ex As InvalidParamsException
            Return JsonRpc.ErrorResponse(id, JsonRpcErrorCodes.InvalidParams, "Invalid params: " & ex.Message, Nothing, _serializer)
        Catch ex As Exception
            Return JsonRpc.ErrorResponse(id, JsonRpcErrorCodes.ServerError, ex.Message, ex.GetType().FullName, _serializer)
        End Try
    End Function
End Class
