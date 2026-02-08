# 查找代理软件的端口

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "查找代理软件端口" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "扫描常见代理端口..." -ForegroundColor Yellow

$commonPorts = @(7890, 7891, 10808, 10809, 1080, 1081, 8080, 8118, 9050)
$foundPorts = @()

foreach ($port in $commonPorts) {
    try {
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $connect = $tcpClient.BeginConnect("127.0.0.1", $port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(100, $false)
        
        if ($wait) {
            $tcpClient.EndConnect($connect)
            Write-Host "  ✅ 端口 $port 正在监听" -ForegroundColor Green
            $foundPorts += $port
        }
        
        $tcpClient.Close()
    }
    catch {
        # 端口未开放
    }
}

Write-Host ""
if ($foundPorts.Count -eq 0) {
    Write-Host "❌ 未找到正在监听的代理端口" -ForegroundColor Red
    Write-Host ""
    Write-Host "请检查：" -ForegroundColor Yellow
    Write-Host "  1. 代理软件是否正在运行" -ForegroundColor White
    Write-Host "  2. 代理软件是否启用了 HTTP 代理" -ForegroundColor White
    Write-Host "  3. 查看代理软件设置中的端口号" -ForegroundColor White
} else {
    Write-Host "找到 $($foundPorts.Count) 个可能的代理端口：" -ForegroundColor Green
    foreach ($port in $foundPorts) {
        Write-Host "  - 127.0.0.1:$port" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "推荐使用第一个端口: $($foundPorts[0])" -ForegroundColor Green
    
    Write-Host ""
    $configure = Read-Host "是否立即配置 aria2 使用端口 $($foundPorts[0])? (Y/n)"
    
    if ($configure -ne "n" -and $configure -ne "N") {
        Write-Host ""
        Write-Host "配置 aria2..." -ForegroundColor Yellow
        
        $proxyUrl = "http://127.0.0.1:$($foundPorts[0])"
        
        # 配置主要的配置文件
        $configFile = "extra\win32\x64\engine\aria2.conf"
        
        if (Test-Path $configFile) {
            $content = Get-Content $configFile -Raw
            
            # 移除旧的代理配置
            $content = $content -replace "(?m)^#?\s*http-proxy=.*$", ""
            $content = $content -replace "(?m)^#?\s*https-proxy=.*$", ""
            $content = $content -replace "(?m)^#?\s*all-proxy=.*$", ""
            $content = $content -replace "(?m)^\s*$\n", ""
            
            # 添加新的代理配置
            $proxyConfig = @"

# 代理配置 (自动添加 - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
http-proxy=$proxyUrl
https-proxy=$proxyUrl
all-proxy=$proxyUrl
"@
            
            $content = $content.TrimEnd() + $proxyConfig + "`n"
            $content | Set-Content $configFile -NoNewline
            
            Write-Host "✅ 配置完成！" -ForegroundColor Green
            Write-Host ""
            Write-Host "测试下载：" -ForegroundColor Yellow
            Write-Host "  cd FluxCore" -ForegroundColor White
            Write-Host "  ./src/aria2c.exe --check-certificate=false https://www.google.com/robots.txt" -ForegroundColor White
        } else {
            Write-Host "❌ 配置文件不存在: $configFile" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "完成" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
