@echo off
REM LSWOO Automated Launcher
REM Double-click this file to set up and run the entire development stack on localhost:8080.

echo Preparing LSWOO stack...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
echo.
echo Launch process ended with exit code %errorlevel%.
pause
