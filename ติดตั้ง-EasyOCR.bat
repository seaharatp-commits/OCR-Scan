@echo off
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 is required for EasyOCR.
  echo Install Python 3.11 from the official Python downloads page, then run this file again.
  start "" "https://www.python.org/downloads/windows/"
  pause
  exit /b 1
)

py -3.11 --version >nul 2>nul
if errorlevel 1 (
  echo Python 3.11 was not found. Install Python 3.11, then run this file again.
  start "" "https://www.python.org/downloads/windows/"
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating a private Python environment for OCRScan...
  py -3.11 -m venv .venv
  if errorlevel 1 goto failed
)

echo Installing CPU-only PyTorch. This download can be large and may take a while...
.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 goto failed
.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto failed
.venv\Scripts\python.exe -m pip install -r requirements-easyocr.txt
if errorlevel 1 goto failed

echo.
echo EasyOCR setup is complete. Run เปิด-OCRScan.bat to start OCRScan.
pause
exit /b 0

:failed
echo.
echo Setup did not finish. Check the error above and run this file again.
pause
exit /b 1
