# FluxCore重新编译脚本
# 修复HTTPS代理问题后需要重新编译

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FluxCore HTTPS代理修复 - 重新编译脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查FluxCore目录是否存在
if (-not (Test-Path "FluxCore")) {
    Write-Host "错误: 找不到FluxCore目录" -ForegroundColor Red
    exit 1
}

Set-Location FluxCore

Write-Host "步骤 1/3: 清理之前的编译..." -ForegroundColor Yellow
if (Test-Path "Makefile") {
    & make clean
}

Write-Host ""
Write-Host "步骤 2/3: 配置编译选项..." -ForegroundColor Yellow
Write-Host "提示: 如果configure失败,请确保已安装必要的编译工具" -ForegroundColor Gray

# 运行configure
# 根据你的系统,可能需要调整配置选项
$configureResult = & bash -c "./configure --enable-ssl --with-openssl 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "配置失败!" -ForegroundColor Red
    Write-Host $configureResult
    Set-Location ..
    exit 1
}

Write-Host ""
Write-Host "步骤 3/3: 编译FluxCore..." -ForegroundColor Yellow
Write-Host "这可能需要几分钟时间..." -ForegroundColor Gray

$makeResult = & make 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "编译失败!" -ForegroundColor Red
    Write-Host $makeResult
    Set-Location ..
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "编译成功!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "编译后的文件位置:" -ForegroundColor Cyan
Write-Host "  aria2c.exe: FluxCore/src/aria2c.exe" -ForegroundColor White
Write-Host ""
Write-Host "下一步:" -ForegroundColor Cyan
Write-Host "  1. 将 FluxCore/src/aria2c.exe 复制到应用程序的引擎目录" -ForegroundColor White
Write-Host "  2. 重启应用程序" -ForegroundColor White
Write-Host "  3. 测试HTTPS下载" -ForegroundColor White
Write-Host ""

Set-Location ..
