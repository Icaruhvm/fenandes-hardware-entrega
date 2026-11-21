@echo off
cd /d "%~dp0"
echo.
echo Fernandes Hardware - versao de apresentacao
echo Neste PC: http://localhost:8080
echo No celular da bancada, use o IP deste computador na mesma rede.
echo.
where python >nul 2>&1
if %errorlevel%==0 (
  python servidor.py
  goto fim
)
py servidor.py
:fim
pause
