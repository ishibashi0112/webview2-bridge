<#
.SYNOPSIS
  MyApp を共有フォルダなどの配布先へ入れ替える（Windows PowerShell 5.1 / PowerShell 7）。

.DESCRIPTION
  1. Release ビルド（pnpm build:web → dotnet build -c Release）。-SkipBuild で省略
  2. 配布物がそろっているか確かめる（MyApp.Host.exe・exe.config・wwwroot\index.html）
  3. 使用中の確認: 配布先で入れ替える exe / DLL をすべて排他で開いてみる。1 つでも開けなければ「使っている人がいる」ので何も変えずに止める
     （途中まで入れ替わった状態を作らない。権限が無いときは別のメッセージ）
  4. 確認（y/N）。-Yes で省略、-DryRun で確かめるだけ
  5. 配布先の今の版を artifacts\deploy-backup\<日時>\ に控える（入れ替える項目だけ）
  6. まとめたフォルダ（MyApp\ または wwwroot\ 等）→ exe.config → exe の順に入れ替える。-Keep（既定 *.local.config）に合う配布先のファイルは残す
  7. 記録 MyApp.deploy-info.txt（日時・配布した人・git のコミット・コミットしていない変更の有無・控えの場所）を配布先に書く

  配布先の直下にほかのアプリのファイルがあっても（母艦と同じ階層に置く形）、入れ替える項目以外には触らない。
  元に戻すときは控えを -Source に指定する: .\scripts\deploy.ps1 -Target <配布先> -SkipBuild -Source artifacts\deploy-backup\<日時>

.PARAMETER Target
  配布先のフォルダ（例: \\server\share\MyApp）。無ければ作る
.PARAMETER Source
  配布物のフォルダ。既定は dotnet\MyApp.Host\bin\Release\net48。控えから戻すときに指定する
.PARAMETER SkipBuild
  ビルドを省略する（既にビルド済み、または控えから戻すとき）
.PARAMETER Yes
  確認（y/N）を省略する
.PARAMETER DryRun
  確認まで行い、何も変えない
.PARAMETER Keep
  配布先に残すファイル名のパターン（既定 *.local.config。資格情報などの配布先ごとの設定）

.EXAMPLE
  .\scripts\deploy.ps1 -Target \\server\share\MyApp
.EXAMPLE
  .\scripts\deploy.ps1 -Target \\server\share\MyApp -SkipBuild -DryRun
.EXAMPLE
  .\scripts\deploy.ps1 -Target \\server\share\MyApp -SkipBuild -Source artifacts\deploy-backup\20261009-093000 -Yes
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Target,
  [string]$Source = "",
  [switch]$SkipBuild,
  [switch]$Yes,
  [switch]$DryRun,
  [string[]]$Keep = @("*.local.config")
)

$ErrorActionPreference = "Stop"

$appName = "MyApp"
$exeName = "MyApp.Host.exe"
$infoName = "$appName.deploy-info.txt"
$root = Split-Path -Parent $PSScriptRoot
$buildOut = Join-Path $root "dotnet\MyApp.Host\bin\Release\net48"
$backupRoot = Join-Path $root "artifacts\deploy-backup"
if ($Source -eq "") { $Source = $buildOut }

function Write-Step([string]$message) { Write-Host "== $message" -ForegroundColor Cyan }
function Fail([string]$message) { Write-Host $message -ForegroundColor Red; exit 1 }
function Test-KeepName([string]$name) {
  foreach ($pattern in $Keep) { if ($name -like $pattern) { return $true } }
  return $false
}

# 1. ビルド
if (-not $SkipBuild) {
  Write-Step "Release ビルド（pnpm build:web → dotnet build -c Release）"
  Push-Location $root
  try {
    & pnpm build:web
    if ($LASTEXITCODE -ne 0) { Fail "pnpm build:web が失敗しました" }
    & dotnet build (Join-Path $root "dotnet\MyApp.sln") -c Release
    if ($LASTEXITCODE -ne 0) { Fail "dotnet build が失敗しました" }
  } finally { Pop-Location }
}

# 2. 配布物の確認
$Source = (Resolve-Path -LiteralPath $Source).Path
Write-Step "配布物の確認: $Source"
if (-not (Test-Path -LiteralPath (Join-Path $Source $exeName))) { Fail "配布物に $exeName がありません（ビルドしていますか）: $Source" }
if (-not (Test-Path -LiteralPath (Join-Path $Source "$exeName.config"))) { Fail "配布物に $exeName.config がありません: $Source" }
$bundled = Test-Path -LiteralPath (Join-Path $Source $appName) -PathType Container
$wwwroot = if ($bundled) { Join-Path (Join-Path $Source $appName) "wwwroot" } else { Join-Path $Source "wwwroot" }
if (-not (Test-Path -LiteralPath (Join-Path $wwwroot "index.html"))) {
  Fail "配布物に wwwroot\index.html がありません（pnpm build:web の後に dotnet build -c Release）: $wwwroot"
}
if ($bundled) { Write-Host "  形: まとめ（$appName\）" } else { Write-Host "  形: exe の隣に並べる" }

# 入れ替える項目 = 配布物の直下の項目（記録ファイルと pdb は除く）。exe と exe.config は最後に入れ替えるので分ける
$entries = @(Get-ChildItem -LiteralPath $Source -Force | Where-Object { $_.Name -ne $infoName -and $_.Extension -ne ".pdb" })
$dirs = @($entries | Where-Object { $_.PSIsContainer })
$files = @($entries | Where-Object { -not $_.PSIsContainer -and $_.Name -ne $exeName -and $_.Name -ne "$exeName.config" })
$ordered = @($dirs) + @($files) + @($entries | Where-Object { $_.Name -eq "$exeName.config" }) + @($entries | Where-Object { $_.Name -eq $exeName })

# 3. 使用中の確認（入れ替える項目の中の exe / DLL だけを見る。配布先にあるほかのアプリのファイルは見ない）
Write-Step "使用中の確認: $Target"
if (-not (Test-Path -LiteralPath $Target)) {
  Write-Host "  配布先はまだありません（新規に作ります）"
}
$candidates = @()
foreach ($e in $ordered) {
  $dest = Join-Path $Target $e.Name
  if (-not (Test-Path -LiteralPath $dest)) { continue }
  if ($e.PSIsContainer) {
    $candidates += @(Get-ChildItem -LiteralPath $dest -Recurse -File | Where-Object { $_.Extension -eq ".exe" -or $_.Extension -eq ".dll" })
  } elseif ($e.Extension -eq ".exe" -or $e.Extension -eq ".dll") {
    $candidates += @(Get-Item -LiteralPath $dest)
  }
}
$locked = @()
$denied = @()
foreach ($f in $candidates) {
  try {
    $stream = [System.IO.File]::Open($f.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $stream.Close()
  } catch {
    $ex = $_.Exception
    if ($ex.InnerException) { $ex = $ex.InnerException }
    if ($ex -is [System.UnauthorizedAccessException]) { $denied += $f.FullName } else { $locked += $f.FullName }
  }
}
if ($denied.Count -gt 0) {
  Write-Host "配布先のファイルに書き込む権限がありません（何も変えていません）:" -ForegroundColor Red
  $denied | ForEach-Object { Write-Host "  $_" }
  exit 1
}
if ($locked.Count -gt 0) {
  Write-Host "使っている人がいるため入れ替えられません（何も変えていません）。終了してもらってから再実行してください:" -ForegroundColor Red
  $locked | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "  使用中のファイルはありません（$($candidates.Count) 個を確認）"

# 4. 確認
Write-Step "配布内容"
Write-Host "  元: $Source"
Write-Host "  先: $Target"
foreach ($e in $ordered) {
  if ($e.PSIsContainer) { Write-Host "  $($e.Name)\" } else { Write-Host "  $($e.Name)" }
}
Write-Host "  残すファイル: $($Keep -join ', ')"
if ($DryRun) { Write-Host "DryRun なので何も変えません" -ForegroundColor Yellow; exit 0 }
if (-not $Yes) {
  $answer = Read-Host "配布しますか? (y/N)"
  if ($answer -notmatch '^[Yy]') { Write-Host "中止しました"; exit 0 }
}

# 5. 控え（入れ替える項目だけ）
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $backupRoot $stamp
$backedUp = $false
if (Test-Path -LiteralPath $Target) {
  foreach ($e in $ordered) {
    $dest = Join-Path $Target $e.Name
    if (-not (Test-Path -LiteralPath $dest)) { continue }
    if (-not $backedUp) { New-Item -ItemType Directory -Path $backup -Force | Out-Null; $backedUp = $true }
    Copy-Item -LiteralPath $dest -Destination (Join-Path $backup $e.Name) -Recurse -Force
  }
}
if ($backedUp) { Write-Step "控え: $backup" } else { Write-Step "控え: なし（配布先に入れ替える項目がありません）"; $backup = "" }

# 6. 入れ替え（フォルダ → その他のファイル → exe.config → exe の順）
Write-Step "入れ替え"
if (-not (Test-Path -LiteralPath $Target)) { New-Item -ItemType Directory -Path $Target -Force | Out-Null }
foreach ($e in $ordered) {
  $dest = Join-Path $Target $e.Name
  if ($e.PSIsContainer) {
    # フォルダは同期する（配布物に無い古いファイルは消す。-Keep に合うファイルは残す）
    $xf = @()
    foreach ($pattern in $Keep) { $xf += $pattern }
    & robocopy $e.FullName $dest /MIR /XF @xf /NFL /NDL /NJH /NJS /NP /R:3 /W:2 | Out-Null
    if ($LASTEXITCODE -ge 8) { Fail "フォルダの入れ替えに失敗しました（robocopy 終了コード $LASTEXITCODE）: $($e.Name)" }
    Write-Host "  $($e.Name)\"
  } else {
    if ((Test-KeepName $e.Name) -and (Test-Path -LiteralPath $dest)) { Write-Host "  $($e.Name)（配布先の物を残す）"; continue }
    Copy-Item -LiteralPath $e.FullName -Destination $dest -Force
    Write-Host "  $($e.Name)"
  }
}

# 7. 記録
$commit = ""
$dirty = ""
try {
  $commit = (& git -C $root rev-parse --short HEAD 2>$null)
  if ($LASTEXITCODE -eq 0) {
    $status = (& git -C $root status --porcelain 2>$null)
    if ($status) { $dirty = "あり" } else { $dirty = "なし" }
  } else { $commit = "(git なし)" }
} catch { $commit = "(git なし)" }
$info = @(
  "配布日時: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "配布した人: $env:USERNAME @ $env:COMPUTERNAME",
  "配布物: $Source",
  "git コミット: $commit",
  "コミットしていない変更: $dirty",
  "控え: $(if ($backup -ne '') { $backup } else { 'なし' })"
)
Set-Content -LiteralPath (Join-Path $Target $infoName) -Value $info -Encoding UTF8
Write-Step "完了: $Target"
$info | ForEach-Object { Write-Host "  $_" }
