# Quick rebuild script for FluxCore after Platform.cc fix
# Run this in MSYS2 MinGW64 shell

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "快速重新编译 FluxCore" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Set-Location FluxCore

Write-Host "清理旧的编译文件..." -ForegroundColor Yellow
& make clean 2>$null

Write-Host "重新编译 Platform.cc 和链接..." -ForegroundColor Yellow
& make -j$env:NUMBER_OF_PROCESSORS

Write-Host "=========================================" -ForegroundColor Green
Write-Host "编译完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

Write-Host ""
Write-Host "测试 HTTPS 下载：" -ForegroundColor Cyan
Write-Host "./src/aria2c.exe --check-certificate=false https://www.google.com/robots.txt" -ForegroundColor White
Write-Host ""
Write-Host "如果测试成功，FluxCore 引擎现在应该可以正常工作了！" -ForegroundColor Green
