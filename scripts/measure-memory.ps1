<#
.SYNOPSIS
  起動中のアプリ（WinForms exe）と、その WebView2 のプロセスのメモリを種類別に集計する（Windows PowerShell 5.1 / PowerShell 7）。

.DESCRIPTION
  exe と、その子孫のプロセス（msedgewebview2.exe のブラウザ・GPU・ユーティリティ・レンダラー・crashpad）を親子関係でたどり、
  1 行ずつ PrivateMB（コミット量 = そのプロセスが押さえている量）と WorkingSetMB（今 RAM にある量）を出し、
  最後に exe だけ / WebView2 だけ / 合計を出す。純粋な WinForms のアプリも同じスクリプトで測れる（WebView2 が 0 になる）。

  タスク マネージャーの「プロセス」タブの「メモリ」列はプライベート ワーキング セットで、ここの 2 つの値の間に来る。
  最小化中の省メモリ（MinimizedMemorySaver）の効果は主に WorkingSetMB に出る。
  測るときは Release ビルドで、DevTools（F12）を閉じておく（DevTools 自体がメモリを使う）。

  ユーザーデータフォルダを複数のアプリで共有した場合、WebView2 のプロセスは最初に起動したアプリの子になるので、
  後から起動したアプリには exe しか出ない。そのときは -AllWebView2 で全部の msedgewebview2.exe を足して比べる。

.PARAMETER Name
  exe の名前（.exe は付けても付けなくてもよい）。既定は WebView2Bridge.Host
.PARAMETER Id
  同じ exe が複数起動しているとき、測るプロセスの ID。省くと最初に見つかったもの
.PARAMETER AllWebView2
  exe の子孫に加えて、このユーザーの msedgewebview2.exe をすべて数える（Edge ブラウザは msedge.exe なので含まれない）

.EXAMPLE
  .\scripts\measure-memory.ps1
.EXAMPLE
  .\scripts\measure-memory.ps1 -Name MyApp.Host
#>
param(
  [string]$Name = "WebView2Bridge.Host",
  [int]$Id = 0,
  [switch]$AllWebView2
)

$ErrorActionPreference = "Stop"
$exeName = if ($Name -like "*.exe") { $Name } else { "$Name.exe" }

$all = @(Get-CimInstance Win32_Process)
$roots = @($all | Where-Object { $_.Name -eq $exeName -and ($Id -eq 0 -or $_.ProcessId -eq $Id) })
if ($roots.Count -eq 0) { throw "$exeName が起動していません" }
$root = $roots[0]
if ($roots.Count -gt 1) { Write-Warning "$exeName が $($roots.Count) 個起動しています。PID $($root.ProcessId) を測ります（-Id で選べる）" }

# exe の子孫を親子関係でたどる
$ids = New-Object 'System.Collections.Generic.List[uint32]'
$ids.Add([uint32]$root.ProcessId)
for ($i = 0; $i -lt $ids.Count; $i++) {
  foreach ($child in $all | Where-Object { $_.ParentProcessId -eq $ids[$i] }) {
    if (-not $ids.Contains([uint32]$child.ProcessId)) { $ids.Add([uint32]$child.ProcessId) }
  }
}
if ($AllWebView2) {
  foreach ($p in $all | Where-Object { $_.Name -eq "msedgewebview2.exe" }) {
    if (-not $ids.Contains([uint32]$p.ProcessId)) { $ids.Add([uint32]$p.ProcessId) }
  }
}

$rows = foreach ($p in $all | Where-Object { $ids.Contains([uint32]$_.ProcessId) }) {
  $line = [string]$p.CommandLine
  if ($p.ProcessId -eq $root.ProcessId) {
    $kind = "exe"
  } elseif ($line -match "--type=([\w-]+)") {
    $kind = $Matches[1]
    if ($line -match "--utility-sub-type=([\w.]+)") { $kind = "$kind ($($Matches[1]))" }
  } elseif ($p.Name -eq "msedgewebview2.exe") {
    $kind = "browser"
  } else {
    $kind = "other: $($p.Name)"
  }
  $proc = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
  if ($proc) {
    [pscustomobject]@{
      Pid          = $p.ProcessId
      Kind         = $kind
      PrivateMB    = [math]::Round($proc.PrivateMemorySize64 / 1MB, 1)
      WorkingSetMB = [math]::Round($proc.WorkingSet64 / 1MB, 1)
    }
  }
}
$rows = @($rows)

$rows | Sort-Object @{ Expression = { $_.Kind -ne "exe" } }, Kind, Pid | Format-Table -AutoSize | Out-String -Width 200 | Write-Host

function Format-Sum($label, $items) {
  $items = @($items)
  $privateSum = 0.0
  $workingSum = 0.0
  foreach ($item in $items) {
    $privateSum += $item.PrivateMB
    $workingSum += $item.WorkingSetMB
  }
  "Private {0,8:N1} MB  WorkingSet {1,8:N1} MB  {2,3} プロセス  {3}" -f $privateSum, $workingSum, $items.Count, $label
}
Format-Sum "exe" ($rows | Where-Object { $_.Kind -eq "exe" })
Format-Sum "WebView2" ($rows | Where-Object { $_.Kind -ne "exe" -and $_.Kind -notlike "other:*" })
Format-Sum "合計" $rows
