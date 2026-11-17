@echo off
setlocal
powershell.exe -NoLogo -NoProfile -File "%~dp0scripts\start-windows.ps1"
if errorlevel 1 (
  echo.
  echo RightTab did not start. See the message above.
  pause
  exit /b 1
)
endlocal
