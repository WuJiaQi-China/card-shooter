<#
.SYNOPSIS
  把 GitHub (origin/main) 上的最新 Card Shooter 构建发布到 itch.io（通过 butler）。

.DESCRIPTION
  始终打包 origin/main（GitHub 最新已推送版本），不使用本地未提交的改动。
  推送两个 channel：
    - html5    : 网页版（index.html 在根）→ 浏览器内运行
    - download : 下载版（内容包在 card-shooter/ 文件夹里）→ 玩家下载解压
  版本号（--userversion）取 origin/main 上的最新 git tag（去掉 v 前缀），与 GitHub Release 统一。

  首次推送后，需在 itch.io 的 Edit game 页面：
    1. 把 html5 channel 勾为 “HTML5 / Playable in browser”；
    2. 页面 Kind of project 设为 “HTML”。
  （这一步 butler 无法自动完成，只需做一次。）

.PARAMETER Target
  itch 目标 "user/game"。省略时读取同目录的 itch-target.txt（单行 user/game）。

.PARAMETER Version
  覆盖版本号。省略时用 origin/main 最新 tag。

.PARAMETER ButlerPath
  butler.exe 的完整路径。省略时读同目录 butler-path.txt，再省略则用 PATH 里的 butler。
  （PATH 满了报“环境变量太大”时，把完整路径写进 butler-path.txt 即可，无需改 PATH。）

.PARAMETER DryRun
  只构建 staging 目录并打印将执行的 butler 命令，不实际推送（用于未装 butler 时验证打包）。

.EXAMPLE
  .\publish-itch.ps1                      # 正式发布：用最新 tag 推两个 channel
  .\publish-itch.ps1 -DryRun              # 仅验证打包，不推送
  .\publish-itch.ps1 -Target me/card-shooter -Version 0.5
#>
param(
  [string]$Target,
  [string]$Version,
  [string]$ButlerPath,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$WebChannel = 'html5'
$DownloadChannel = 'download'
$mainRef = 'origin/main'

# 1) itch 目标
if (-not $Target) {
  if (Test-Path itch-target.txt) { $Target = (Get-Content itch-target.txt -Raw).Trim() }
}
if (-not $Target) {
  throw "缺少 itch 目标。用 -Target user/game，或在 itch-target.txt 写一行 user/game。"
}

# 2) 同步远程 + 从 origin/main 最新 tag 取版本号
Write-Host "Fetching origin (with tags)..." -ForegroundColor DarkGray
git fetch origin --tags --quiet
if ($LASTEXITCODE -ne 0) { throw "git fetch 失败。" }
if (-not $Version) {
  $tag = (git describe --tags --abbrev=0 $mainRef 2>$null)
  if (-not $tag) {
    throw "origin/main 上没有 tag。先打 tag（如 git tag v0.5; git push origin v0.5），或用 -Version 指定。"
  }
  $Version = $tag -replace '^v', ''
}
Write-Host "Target = $Target   Version = $Version   Source = $mainRef" -ForegroundColor Cyan

# 3) 从 origin/main 导出文件到 staging（= GitHub 最新，不含本地脏改动）
$build = Join-Path $PSScriptRoot 'build'
if (Test-Path $build) { Remove-Item $build -Recurse -Force }
$web = Join-Path $build 'web'
$dlInner = Join-Path $build 'download\card-shooter'
New-Item -ItemType Directory -Force -Path $web, $dlInner | Out-Null

$archive = Join-Path $build 'src.zip'
git archive --format=zip -o $archive $mainRef index.html style.css game.js audio
if ($LASTEXITCODE -ne 0) { throw "git archive 失败。" }
Expand-Archive -Path $archive -DestinationPath $web -Force
Remove-Item $archive

# 下载版 = 网页版相同内容，但包在 card-shooter/ 子文件夹里
Copy-Item (Join-Path $web '*') $dlInner -Recurse -Force

$webEntries = (Get-ChildItem $web -Recurse -File | Measure-Object).Count
Write-Host "Staged: web/ ($webEntries files, index.html at root) + download/card-shooter/" -ForegroundColor DarkGray

# 4) 解析 butler 可执行：优先 -ButlerPath，其次 butler-path.txt，最后 PATH 里的 butler
if (-not $ButlerPath) {
  if (Test-Path butler-path.txt) { $ButlerPath = (Get-Content butler-path.txt -Raw).Trim() }
}
if (-not $ButlerPath) { $ButlerPath = 'butler' }

# 5) 推送（或 DryRun）
$dl = Join-Path $build 'download'
$webCmd = @('push', $web, "${Target}:${WebChannel}", '--userversion', $Version)
$dlCmd  = @('push', $dl,  "${Target}:${DownloadChannel}", '--userversion', $Version)

if ($DryRun) {
  Write-Host "[DryRun] `"$ButlerPath`" $($webCmd -join ' ')" -ForegroundColor Yellow
  Write-Host "[DryRun] `"$ButlerPath`" $($dlCmd  -join ' ')" -ForegroundColor Yellow
  Write-Host "[DryRun] staging 保留在 $build 供检查。" -ForegroundColor Yellow
  return
}

& $ButlerPath @webCmd
if ($LASTEXITCODE -ne 0) { throw "butler push (web) 失败。" }
& $ButlerPath @dlCmd
if ($LASTEXITCODE -ne 0) { throw "butler push (download) 失败。" }

Remove-Item $build -Recurse -Force
Write-Host "✓ 已发布 $Target  →  ${WebChannel} + ${DownloadChannel}  @ v$Version" -ForegroundColor Green
Write-Host "  https://itch.io/dashboard" -ForegroundColor DarkGray
