@echo off
cd /d "%~dp0"
start "OCRScan Server" cmd /k "node server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173"
