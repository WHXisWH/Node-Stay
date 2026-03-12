# check-ja-content.ps1
# 日本語コンテンツ確認スクリプト
# Usage: pwsh scripts/check-ja-content.ps1

param(
    [switch]$Verbose,
    [string]$Path = "."
)

$ErrorCount = 0
$WarningCount = 0

Write-Host "===== 日本語コンテンツ確認 =====" -ForegroundColor Cyan
Write-Host ""

# 英語エラーメッセージパターン
$EnglishErrorPatterns = @(
    "throw.*Error\(['\"](?!.*[ぁ-んァ-ン一-龥]).*['\"]",
    "UnauthorizedException\(['\"](?!.*[ぁ-んァ-ン一-龥]).*['\"]",
    "BadRequestException\(['\"](?!.*[ぁ-んァ-ン一-龥]).*['\"]",
    "ForbiddenException\(['\"](?!.*[ぁ-んァ-ン一-龥]).*['\"]",
    "NotFoundException\(['\"](?!.*[ぁ-んァ-ン一-龥]).*['\"]"
)

# UI 文言パターン（英語を検出）
$EnglishUIPatterns = @(
    "message:\s*['\"](?:Please|Error|Failed|Success|Invalid|Required)['\"]",
    "title:\s*['\"](?:Error|Warning|Info|Success)['\"]"
)

function Test-JapaneseContent {
    param([string]$Content)
    return $Content -match "[ぁ-んァ-ン一-龥]"
}

function Check-File {
    param([string]$FilePath)

    $RelPath = $FilePath -replace [regex]::Escape((Get-Location).Path + [IO.Path]::DirectorySeparatorChar), ""
    $Content = Get-Content -Path $FilePath -Raw -ErrorAction SilentlyContinue

    if (-not $Content) { return }

    $Issues = @()

    # 英語エラーメッセージ検出
    foreach ($Pattern in $EnglishErrorPatterns) {
        $Matches = [regex]::Matches($Content, $Pattern)
        foreach ($Match in $Matches) {
            $LineNum = ($Content.Substring(0, $Match.Index) -split "`n").Count
            $Issues += @{
                Type = "ERROR"
                Line = $LineNum
                Message = "英語エラーメッセージ: $($Match.Value.Substring(0, [Math]::Min(50, $Match.Value.Length)))..."
            }
            $script:ErrorCount++
        }
    }

    # UI 英語パターン検出
    foreach ($Pattern in $EnglishUIPatterns) {
        $Matches = [regex]::Matches($Content, $Pattern)
        foreach ($Match in $Matches) {
            $LineNum = ($Content.Substring(0, $Match.Index) -split "`n").Count
            $Issues += @{
                Type = "WARN"
                Line = $LineNum
                Message = "英語UIテキスト: $($Match.Value)"
            }
            $script:WarningCount++
        }
    }

    if ($Issues.Count -gt 0) {
        Write-Host "📄 $RelPath" -ForegroundColor Yellow
        foreach ($Issue in $Issues) {
            $Color = if ($Issue.Type -eq "ERROR") { "Red" } else { "DarkYellow" }
            Write-Host "   [$($Issue.Type)] L$($Issue.Line): $($Issue.Message)" -ForegroundColor $Color
        }
        Write-Host ""
    }
    elseif ($Verbose) {
        Write-Host "✅ $RelPath" -ForegroundColor Green
    }
}

# 対象ファイル取得
$TargetExtensions = @("*.ts", "*.tsx", "*.js", "*.jsx")
$ExcludeDirs = @("node_modules", ".next", "dist", "coverage", ".git", "JPYC_PJ")

$Files = @()
foreach ($Ext in $TargetExtensions) {
    $Files += Get-ChildItem -Path $Path -Filter $Ext -Recurse -File |
        Where-Object {
            $FullPath = $_.FullName
            -not ($ExcludeDirs | Where-Object { $FullPath -like "*$_*" })
        }
}

Write-Host "対象ファイル数: $($Files.Count)" -ForegroundColor Gray
Write-Host ""

foreach ($File in $Files) {
    Check-File -FilePath $File.FullName
}

Write-Host "===== 確認完了 =====" -ForegroundColor Cyan
Write-Host "エラー: $ErrorCount" -ForegroundColor $(if ($ErrorCount -gt 0) { "Red" } else { "Green" })
Write-Host "警告: $WarningCount" -ForegroundColor $(if ($WarningCount -gt 0) { "Yellow" } else { "Green" })

if ($ErrorCount -gt 0) {
    exit 1
}
exit 0
