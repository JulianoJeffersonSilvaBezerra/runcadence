@echo off
setlocal
cd /d %~dp0
call gradlew.bat installDebug --console=plain --no-daemon
exit /b %errorlevel%
