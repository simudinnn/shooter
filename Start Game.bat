@echo off
title Robot Ruins
cd /d "%~dp0"
echo Starting Robot Ruins (game + multiplayer server)...
echo Open the http://localhost:XXXX link in your browser (NOT ws://).
echo.
call npm start
echo.
pause
