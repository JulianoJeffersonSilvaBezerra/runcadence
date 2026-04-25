@echo off
setlocal
set "ADB=C:\Users\JULIANO\AppData\Local\Android\Sdk\platform-tools\adb.exe"
set "APK=C:\PaceUp\android\app\build\outputs\apk\debug\app-debug.apk"

echo === ADB DEVICES ===
"%ADB%" devices
if errorlevel 1 exit /b %errorlevel%

echo === INSTALL APK ===
"%ADB%" install -r "%APK%"
exit /b %errorlevel%
