# FluxCore HTTPS 下载问题修复脚本 (PowerShell 版本)
# 此脚本将诊断问题并提供修复建议

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "FluxCore HTTPS 问题诊断工具" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 FluxCore 配置
$fluxcoreConfigLog = "FluxCore\config.log"
if (Test-Path $fluxcoreConfigLog) {
    Write-Host "检查 FluxCore 配置..." -ForegroundColor Yellow
    
    # 检查 OpenSSL 状态
    $openssl = Select-String -Path $fluxcoreConfigLog -Pattern "OpenSSL:\s+(\w+)" | Select-Object -Last 1
    if ($openssl) {
        $opensslStatus = $openssl.Matches.Groups[1].Value
        if ($opensslStatus -eq "yes") {
            Write-Host "✓ OpenSSL: 已启用" -ForegroundColor Green
        } else {
            Write-Host "✗ OpenSSL: 未启用 ($opensslStatus)" -ForegroundColor Red
        }
    }
    
    # 检查 WinTLS 状态
    $wintls = Select-String -Path $fluxcoreConfigLog -Pattern "WinTLS:\s+(\w+)" | Select-Object -Last 1
    if ($wintls) {
        $wintlsStatus = $wintls.Matches.Groups[1].Value
        if ($wintlsStatus -eq "yes") {
            Write-Host "✗ WinTLS: 已启用 (这可能导致 HTTPS 问题)" -ForegroundColor Red
        } else {
            Write-Host "✓ WinTLS: 未启用" -ForegroundColor Green
        }
    }
    
    # 检查 GnuTLS 状态
    $gnutls = Select-String -Path $fluxcoreConfigLog -Pattern "GnuTLS:\s+(\w+)" | Select-Object -Last 1
    if ($gnutls) {
        $gnutlsStatus = $gnutls.Matches.Groups[1].Value
        Write-Host "  GnuTLS: $gnutlsStatus" -ForegroundColor Gray
    }
} else {
    Write-Host "✗ 未找到 FluxCore 配置文件" -ForegroundColor Red
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "问题分析" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "根据配置分析，FluxCore 无法下载 HTTPS 的原因：" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. OpenSSL 未正确启用" -ForegroundColor White
Write-Host "   - FluxCore 配置时虽然指定了 --with-openssl" -ForegroundColor Gray
Write-Host "   - 但 OpenSSL 库没有被正确检测到或链接" -ForegroundColor Gray
Write-Host ""
Write-Host "2. 使用了 WinTLS 作为替代" -ForegroundColor White
Write-Host "   - WinTLS (Windows Schannel) 存在兼容性问题" -ForegroundColor Gray
Write-Host "   - 可能无法正确验证某些 HTTPS 证书" -ForegroundColor Gray
Write-Host "   - 对某些 TLS 版本和加密套件支持不完整" -ForegroundColor Gray
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "解决方案" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "方案 1: 重新编译 FluxCore (推荐)" -ForegroundColor Green
Write-Host "---------------------------------------" -ForegroundColor Gray
Write-Host "1. 在 MSYS2/MinGW64 环境中运行：" -ForegroundColor White
Write-Host "   bash fix-fluxcore-https.sh" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. 或手动执行以下步骤：" -ForegroundColor White
Write-Host "   a. 安装 OpenSSL: pacman -S mingw-w64-x86_64-openssl" -ForegroundColor Gray
Write-Host "   b. 清理: cd FluxCore; make clean" -ForegroundColor Gray
Write-Host "   c. 重新配置（添加 --without-wintls 参数）" -ForegroundColor Gray
Write-Host "   d. 编译: make -j" -ForegroundColor Gray
Write-Host ""

Write-Host "方案 2: 使用 aria2 引擎 (最简单)" -ForegroundColor Green
Write-Host "---------------------------------------" -ForegroundColor Gray
Write-Host "aria2 引擎已经正确配置了 OpenSSL，可以正常下载 HTTPS" -ForegroundColor White
Write-Host "建议继续使用 aria2 引擎，无需修改" -ForegroundColor White
Write-Host ""

Write-Host "方案 3: 临时禁用证书验证 (不推荐)" -ForegroundColor Yellow
Write-Host "---------------------------------------" -ForegroundColor Gray
Write-Host "在 FluxCore 配置中添加：" -ForegroundColor White
Write-Host "  check-certificate=false" -ForegroundColor Cyan
Write-Host "注意：这会降低安全性，不建议用于生产环境" -ForegroundColor Red
Write-Host ""

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "详细信息" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "完整的分析报告已保存到: compare-engines.md" -ForegroundColor White
Write-Host "修复脚本: fix-fluxcore-https.sh (需要在 MSYS2 中运行)" -ForegroundColor White
Write-Host ""

# 检查 aria2 配置作为对比
$aria2ConfigLog = "aria2\config.log"
if (Test-Path $aria2ConfigLog) {
    Write-Host "对比：aria2 引擎配置" -ForegroundColor Yellow
    $aria2Openssl = Select-String -Path $aria2ConfigLog -Pattern "OpenSSL:\s+(\w+)" | Select-Object -Last 1
    if ($aria2Openssl) {
        $aria2OpensslStatus = $aria2Openssl.Matches.Groups[1].Value
        Write-Host "  aria2 OpenSSL: $aria2OpensslStatus" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
