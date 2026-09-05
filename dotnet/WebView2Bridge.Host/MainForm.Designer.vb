<Global.Microsoft.VisualBasic.CompilerServices.DesignerGenerated()>
Partial Class MainForm
    Inherits System.Windows.Forms.Form

    'フォームがコンポーネントの一覧をクリーンアップするために dispose をオーバーライドします。
    <System.Diagnostics.DebuggerNonUserCode()>
    Protected Overrides Sub Dispose(disposing As Boolean)
        Try
            If disposing AndAlso components IsNot Nothing Then
                components.Dispose()
            End If
        Finally
            MyBase.Dispose(disposing)
        End Try
    End Sub

    'Windows フォーム デザイナーで必要です。
    Private components As System.ComponentModel.IContainer

    'メモ: 以下のプロシージャは Windows フォーム デザイナーで必要です。
    'Windows フォーム デザイナーを使用して変更できます。
    'コード エディターを使って変更しないでください。
    <System.Diagnostics.DebuggerStepThrough()>
    Private Sub InitializeComponent()
        Me.WebView = New Microsoft.Web.WebView2.WinForms.WebView2()
        CType(Me.WebView, System.ComponentModel.ISupportInitialize).BeginInit()
        Me.SuspendLayout()
        '
        'WebView
        '
        Me.WebView.AllowExternalDrop = True
        Me.WebView.CreationProperties = Nothing
        Me.WebView.DefaultBackgroundColor = System.Drawing.Color.White
        Me.WebView.Dock = System.Windows.Forms.DockStyle.Fill
        Me.WebView.Location = New System.Drawing.Point(0, 0)
        Me.WebView.Name = "WebView"
        Me.WebView.Size = New System.Drawing.Size(1024, 720)
        Me.WebView.TabIndex = 0
        Me.WebView.ZoomFactor = 1.0R
        '
        'MainForm
        '
        Me.AutoScaleDimensions = New System.Drawing.SizeF(7.0!, 15.0!)
        Me.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font
        Me.ClientSize = New System.Drawing.Size(1024, 720)
        Me.Controls.Add(Me.WebView)
        Me.Name = "MainForm"
        Me.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen
        Me.Text = "WebView2Bridge.Host"
        CType(Me.WebView, System.ComponentModel.ISupportInitialize).EndInit()
        Me.ResumeLayout(False)
    End Sub

    Friend WithEvents WebView As Microsoft.Web.WebView2.WinForms.WebView2
End Class
