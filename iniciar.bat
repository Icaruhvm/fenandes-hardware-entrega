@echo off
cd /d "%~dp0"
echo.
echo Fernandes Hardware - versao de apresentacao
echo Neste PC: http://127.0.0.1:8080
echo O token do Bling, se existir, so responde neste computador.
echo.
where python >nul 2>&1
if %errorlevel%==0 (
  python servidor.py
  goto fim
)
py servidor.py
:fim
pause
