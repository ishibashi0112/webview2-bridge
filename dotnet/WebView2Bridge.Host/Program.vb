Option Strict On

Imports System
Imports System.Windows.Forms

Friend Module Program
    <STAThread>
    Friend Sub Main()
        Application.EnableVisualStyles()
        Application.SetCompatibleTextRenderingDefault(False)
        Application.Run(New MainForm())
    End Sub
End Module
