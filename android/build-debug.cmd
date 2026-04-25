@echo off
setlocal
cd /d %~dp0
call gradlew.bat assembleDebug --console=plain --no-daemon
exit /b %errorlevel%