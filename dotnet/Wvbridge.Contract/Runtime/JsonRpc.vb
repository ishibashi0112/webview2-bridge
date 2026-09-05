Imports System.IO
Imports Newtonsoft.Json
Imports Newtonsoft.Json.Linq

''' <summary>JSON-RPC 2.0 のエラーコード（HANDOFF.md §5）。</summary>
Public NotInheritable Class JsonRpcErrorCodes
    Private Sub New()
    End Sub

    Public Const ParseError As Integer = -32700
    Public Const InvalidRequest As Integer = -32600
    Public Const MethodNotFound As Integer = -32601
    Public Const InvalidParams As Integer = -32602
    Public Const InternalError As Integer = -32603
    ''' <summary>アプリ定義エラーの既定値。VB 側の例外はこのコードに変換される。</summary>
    Public Const ServerError As Integer = -32000
End Class

''' <summary>params のデシリアライズ失敗など、-32602 に変換すべきエラー。</summary>
Public Class InvalidParamsException
    Inherits Exception

    Public Sub New(message As String)
        MyBase.New(message)
    End Sub

    Public Sub New(message As String, innerException As Exception)
        MyBase.New(message, innerException)
    End Sub
End Class

''' <summary>
''' JSON-RPC 2.0 封筒の組み立てと解釈。文字列（JSON）と JToken の境界はここに閉じ込める。
''' </summary>
Public NotInheritable Class JsonRpc
    Private Sub New()
    End Sub

    Public Const Version As String = "2.0"

    ''' <summary>
    ''' ブリッジ全体で使うシリアライザ設定。
    ''' 日付は文字列のまま往復する（Newtonsoft の自動 DateTime 変換を切る）。
    ''' </summary>
    Public Shared Function CreateSerializerSettings() As JsonSerializerSettings
        Return New JsonSerializerSettings With {
            .DateParseHandling = DateParseHandling.None,
            .NullValueHandling = NullValueHandling.Include,
            .MissingMemberHandling = MissingMemberHandling.Ignore
        }
    End Function

    Public Shared Function CreateSerializer() As JsonSerializer
        Return JsonSerializer.Create(CreateSerializerSettings())
    End Function

    ''' <summary>JSON 文字列を JObject として読む。日付文字列は変換しない。</summary>
    Public Shared Function ParseObject(json As String) As JObject
        Using reader As New JsonTextReader(New StringReader(json)) With {
            .DateParseHandling = DateParseHandling.None
        }
            Dim token = JToken.ReadFrom(reader)
            Dim obj = TryCast(token, JObject)
            If obj Is Nothing Then Throw New JsonReaderException("JSON-RPC message must be an object")
            Return obj
        End Using
    End Function

    Public Shared Function SuccessResponse(id As JToken, result As Object, serializer As JsonSerializer) As String
        Dim resultToken As JToken = If(result Is Nothing, CType(JValue.CreateNull(), JToken), JToken.FromObject(result, serializer))
        Dim res As New JObject From {
            {"jsonrpc", Version},
            {"id", NormalizeId(id)},
            {"result", resultToken}
        }
        Return res.ToString(Formatting.None)
    End Function

    Public Shared Function ErrorResponse(id As JToken, code As Integer, message As String, data As Object, serializer As JsonSerializer) As String
        Dim err As New JObject From {
            {"code", code},
            {"message", If(message, String.Empty)}
        }
        If data IsNot Nothing Then err("data") = JToken.FromObject(data, serializer)
        Dim res As New JObject From {
            {"jsonrpc", Version},
            {"id", NormalizeId(id)},
            {"error", err}
        }
        Return res.ToString(Formatting.None)
    End Function

    ''' <summary>Host → Web の通知（id なし）。</summary>
    Public Shared Function Notification(method As String, params As Object, serializer As JsonSerializer) As String
        Dim msg As New JObject From {
            {"jsonrpc", Version},
            {"method", method}
        }
        If params IsNot Nothing Then msg("params") = JToken.FromObject(params, serializer)
        Return msg.ToString(Formatting.None)
    End Function

    Private Shared Function NormalizeId(id As JToken) As JToken
        If id Is Nothing Then Return JValue.CreateNull()
        Return id
    End Function
End Class
