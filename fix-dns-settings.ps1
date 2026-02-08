# 修复 DNS 设置脚本
# 需要管理员权限运行

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "修复 DNS 设置" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 检查管理员权限
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host ""
    Write-Host "❌ 需要管理员权限！" -ForegroundColor Red
    Write-Host ""
    Write-Host "请右键点击 PowerShell，选择'以管理员身份运行'，然后执行：" -ForegroundColor Yellow
    Write-Host "  cd '$PWD'" -ForegroundColor White
    Write-Host "  .\fix-dns-settings.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "或者手动修改 DNS：" -ForegroundColor Yellow
    Write-Host "1. 打开'设置' → '网络和 Internet' → '状态'" -ForegroundColor White
    Write-Host "2. 点击'更改适配器选项'" -ForegroundColor White
    Write-Host "3. 右键点击网络连接 → '属性'" -ForegroundColor White
    Write-Host "4. 选择'Internet 协议版本 4 (TCP/IPv4)' → '属性'" -ForegroundColor White
    Write-Host "5. 选择'使用下面的 DNS 服务器地址'：" -ForegroundColor White
    Write-Host "   首选 DNS: 223.5.5.5 (阿里 DNS)" -ForegroundColor Green
    Write-Host "   备用 DNS: 8.8.8.8 (Google DNS)" -ForegroundColor Green
    Write-Host ""
    exit 1
}

Write-Host ""
Write-Host "获取网络适配器..." -ForegroundColor Yellow

# 获取活动的网络适配器
$adapters = Get-NetAdapter | Where-Object {$_.Status -eq "Up"}

if ($adapters.Count -eq 0) {
    Write-Host "❌ 未找到活动的网络适配器" -ForegroundColor Red
    exit 1
}

Write-Host "找到 $($adapters.Count) 个活动的网络适配器：" -ForegroundColor Green
$adapters | Format-Table Name, InterfaceDescription, Status -AutoSize

Write-Host ""
Write-Host "选择 DNS 服务器：" -ForegroundColor Yellow
Write-Host "1. 阿里 DNS (223.5.5.5, 223.6.6.6) - 推荐国内用户" -ForegroundColor White
Write-Host "2. Google DNS (8.8.8.8, 8.8.4.4)" -ForegroundColor White
Write-Host "3. Cloudflare DNS (1.1.1.1, 1.0.0.1)" -ForegroundColor White
Write-Host "4. 114 DNS (114.114.114.114, 114.114.115.115)" -ForegroundColor White

$choice = Read-Host "`n请选择 (1-4)"

switch ($choice) {
    "1" {
        $primaryDNS = "223.5.5.5"
        $secondaryDNS = "223.6.6.6"
        $dnsName = "阿里 DNS"
    }
    "2" {
        $primaryDNS = "8.8.8.8"
        $secondaryDNS = "8.8.4.4"
        $dnsName = "Google DNS"
    }
    "3" {
        $primaryDNS = "1.1.1.1"
        $secondaryDNS = "1.0.0.1"
        $dnsName = "Cloudflare DNS"
    }
    "4" {
        $primaryDNS = "114.114.114.114"
        $secondaryDNS = "114.114.115.115"
        $dnsName = "114 DNS"
    }
    default {
        $primaryDNS = "223.5.5.5"
        $secondaryDNS = "223.6.6.6"
        $dnsName = "阿里 DNS"
    }
}

Write-Host ""
Write-Host "设置 DNS 为 $dnsName..." -ForegroundColor Yellow

foreach ($adapter in $adapters) {
    Write-Host "  配置 $($adapter.Name)..." -ForegroundColor Gray
    
    try {
        # 设置 IPv4 DNS
        Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses ($primaryDNS, $secondaryDNS)
        Write-Host "  ✅ $($adapter.Name) 配置成功" -ForegroundColor Green
    }
    catch {
        Write-Host "  ❌ $($adapter.Name) 配置失败: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "刷新 DNS 缓存..." -ForegroundColor Yellow
ipconfig /flushdns | Out-Null

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "验证 DNS 设置" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "测试 DNS 解析..." -ForegroundColor Yellow
$testResult = nslookup www.baidu.com 2>&1 | Out-String

if ($testResult -match "Address.*\d+\.\d+\.\d+\.\d+") {
    Write-Host "✅ DNS 解析成功！" -ForegroundColor Green
    Write-Host $testResult
} else {
    Write-Host "❌ DNS 解析失败" -ForegroundColor Red
    Write-Host $testResult
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "完成！" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Write-Host ""
Write-Host "下一步：测试 HTTPS 下载" -ForegroundColor Yellow
Write-Host "  cd FluxCore" -ForegroundColor White
Write-Host "  ./src/aria2c.exe --check-certificate=false https://www.baidu.com/robots.txt" -ForegroundColor White
