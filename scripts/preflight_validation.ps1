param(
    [switch]$CleanNodeModules
)

Write-Host "=== MLOPS Preflight Validation ===" -ForegroundColor Cyan

function Test-Port {
    param([int]$Port)
    try {
        $result = Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -WarningAction SilentlyContinue
        if ($result.TcpTestSucceeded) {
            Write-Host "[OK] Port $Port is OPEN" -ForegroundColor Green
            return $true
        }
        Write-Host "[WARN] Port $Port is CLOSED" -ForegroundColor Yellow
        return $false
    } catch {
        Write-Host "[WARN] Port $Port check failed: $($_.Exception.Message)" -ForegroundColor Yellow
        return $false
    }
}

$mysqlService = Get-Service -Name MYSQL80 -ErrorAction SilentlyContinue
if ($null -eq $mysqlService) {
    Write-Host "[WARN] MYSQL80 service not found on this machine" -ForegroundColor Yellow
} else {
    Write-Host "[INFO] MYSQL80 service status: $($mysqlService.Status)" -ForegroundColor Gray
}

$mysqlOpen = Test-Port -Port 3306
$ganacheOpen = Test-Port -Port 7545
$apiOpen = Test-Port -Port 8000

if ($ganacheOpen) {
    try {
        $rpcPayload = '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
        $rpcResponse = Invoke-RestMethod -Uri "http://127.0.0.1:7545" -Method Post -ContentType "application/json" -Body $rpcPayload -TimeoutSec 10
        Write-Host "[OK] Ganache RPC chainId: $($rpcResponse.result)" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Ganache RPC probe failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

$ignoreRule = @("blockchain/node_modules", "blockchain/node_modules/.bin") | git check-ignore -v --stdin 2>$null | Select-Object -First 1
if ($ignoreRule) {
    Write-Host "[INFO] blockchain/node_modules is intentionally git-ignored" -ForegroundColor Gray
    Write-Host "       Rule: $ignoreRule" -ForegroundColor Gray
} else {
    Write-Host "[WARN] blockchain/node_modules is not currently ignored" -ForegroundColor Yellow
}

if ($CleanNodeModules -and (Test-Path "blockchain/node_modules")) {
    Remove-Item -Recurse -Force "blockchain/node_modules"
    Write-Host "[OK] Removed blockchain/node_modules (recreate with npm install)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Suggested fixes if anything is WARN:" -ForegroundColor Cyan
Write-Host "1) Start MySQL as administrator: Start-Service MYSQL80"
Write-Host "2) Start Ganache GUI/CLI on http://127.0.0.1:7545"
Write-Host "3) Reinstall blockchain deps when needed: cd blockchain; npm install"
Write-Host "4) Start backend API: python manage.py runserver 127.0.0.1:8000"
