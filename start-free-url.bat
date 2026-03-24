@echo off
setlocal
cd /d "%~dp0"

echo =========================================
echo Print Pilot Free Public URL Launcher
echo =========================================
echo.
echo Starting server...
start "Print Pilot Server" cmd /k "pushd ""%~dp0"" && npm start"

echo Waiting for local server health check on http://127.0.0.1:8080/health ...
set "READY=0"
for /L %%I in (1,1,30) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8080/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if !errorlevel! == 0 (
    set "READY=1"
    goto :ready
  )
  timeout /t 1 /nobreak >nul
)

:ready
if "%READY%"=="0" (
  echo WARNING: server health check did not pass yet.
  echo Tunnel will still start, but you may see 503 until server is ready.
)

echo Starting free public URL tunnel...
start "Print Pilot Free URL" cmd /k "pushd ""%~dp0"" && npm run free:url -- --local-host 127.0.0.1 --print-requests"

echo.
echo Two windows were opened:
echo 1) Print Pilot Server
echo 2) Print Pilot Free URL
echo.
echo Copy the https:// URL shown in the tunnel window.
echo Keep both windows open while using remote access.

endlocal
