@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo =========================================
echo Print Pilot Permanent URL Launcher
echo =========================================

if not exist ".env.tunnel" (
  echo.
  echo Missing .env.tunnel
  echo Creating it from .env.tunnel.example now...
  copy /Y ".env.tunnel.example" ".env.tunnel" >nul
  echo.
  echo Open .env.tunnel and paste your Cloudflare token:
  echo   CF_TUNNEL_TOKEN=...
  echo.
  start "" notepad ".env.tunnel"
  echo Save the file, then run this script again.
  goto :end
)

set "CF_TUNNEL_TOKEN="
for /f "usebackq tokens=1,* delims==" %%A in (".env.tunnel") do (
  if /I "%%A"=="CF_TUNNEL_TOKEN" set "CF_TUNNEL_TOKEN=%%B"
)

if "%CF_TUNNEL_TOKEN%"=="" (
  echo.
  echo CF_TUNNEL_TOKEN is empty in .env.tunnel
  echo Please set it, save, and run this script again.
  start "" notepad ".env.tunnel"
  goto :end
)

where cloudflared >nul 2>nul
if errorlevel 1 (
  echo.
  echo cloudflared is not installed.
  echo Install from:
  echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  echo.
  echo Then run this script again.
  goto :end
)

echo.
echo Starting Flashforge server...
start "Print Pilot Server" cmd /k "pushd ""%~dp0"" && npm start"

echo Waiting for server startup...
timeout /t 3 /nobreak >nul

echo.
echo Starting permanent Cloudflare tunnel...
start "Print Pilot Tunnel" cmd /k "pushd ""%~dp0"" && set CF_TUNNEL_TOKEN=%CF_TUNNEL_TOKEN% && cloudflared tunnel run --token %CF_TUNNEL_TOKEN%"

echo.
echo Keep both windows open:
echo - Print Pilot Server
echo - Print Pilot Tunnel
echo.
echo Your permanent URL is the DNS hostname you mapped in Cloudflare.
echo Example: https://app.yourdomain.com

:end
endlocal
