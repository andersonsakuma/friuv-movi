@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo Amazonia Bee - FriUV Movi (teste local)
echo ============================================
set "PY="
where py >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if not defined PY (
  where python >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  echo Python 3 nao encontrado. Instale em https://www.python.org/downloads/windows/
  pause
  exit /b 1
)
echo Abrindo http://localhost:8080 no navegador padrao.
echo Use Chrome ou Edge para o Bluetooth. Feche esta janela para encerrar.
start "" http://localhost:8080
%PY% -m http.server 8080
