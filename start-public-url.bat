@echo off
setlocal
cd /d "%~dp0"

echo Starting Flashforge server...
start "Flashforge Server" cmd /k "pushd ""%~dp0"" && npm start"

echo Waiting for server startup...
timeout /t 3 /nobreak >nul

echo Starting secure public tunnel...
start "Flashforge Public URL" cmd /k "pushd ""%~dp0"" && npm run free:url"

echo.
echo Two windows were opened:
echo 1) Server window
echo 2) Tunnel window (copy the https URL shown there)
echo.
echo Keep both windows open while using remote access.
endlocal
