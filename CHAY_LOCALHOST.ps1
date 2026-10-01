[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  NOIRE ANALYTICS HUB — KHOI DONG LOCALHOST      " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Thu muc: $PSScriptRoot`n"

Set-Location -Path $PSScriptRoot

# Kiem tra Node.js
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "  [X] Chua tim thay Node.js tren may." -ForegroundColor Red
    Write-Host "      Vui long cai dat Node.js tu: https://nodejs.org/" -ForegroundColor Yellow
    Read-Host "Nhan Enter de ket thuc..."
    exit 1
}

Write-Host "  Node.js: $($node.Source)" -ForegroundColor Green
Write-Host "  Dang khoi dong server tai: http://localhost:3001 ...`n" -ForegroundColor Yellow

# Mo trinh duyet sau 3 giay
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3001"
} | Out-Null

# Chay dev server
if (Get-Command npm -ErrorAction SilentlyContinue) {
    npm run dev
} else {
    node scripts/build-data.mjs
    node ./node_modules/vite/bin/vite.js
}

Write-Host "`nServer da dung."
Read-Host "Nhan Enter de dong cua so..."
