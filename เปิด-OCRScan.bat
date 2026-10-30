@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" echo EasyOCR ยังไม่ติดตั้ง แอปจะใช้ OCR สำรองในเบราว์เซอร์ — รัน ติดตั้ง-EasyOCR.bat เพื่อเปิดใช้ EasyOCR
start "OCRScan Server" cmd /k "node server.mjs"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4173"
