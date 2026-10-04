@echo off
rem Abre FARO en pantalla completa con el sonido habilitado sin necesidad de clic.
rem Chrome bloquea el audio hasta un clic o una tecla, y los botones del joystick
rem no cuentan. Este lanzador usa un perfil aparte para que el permiso siempre aplique.

set "GAME=%~dp0index.html"
set "PROFILE=%TEMP%\faro-stand-perfil"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%CHROME%" (
  echo No encontre Chrome ni Edge instalados.
  pause
  exit /b 1
)

start "" "%CHROME%" --user-data-dir="%PROFILE%" --autoplay-policy=no-user-gesture-required --kiosk --no-first-run "file:///%GAME%"
