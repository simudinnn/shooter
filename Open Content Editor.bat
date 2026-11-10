@echo off
title Robot Ruins - Editor
cd /d "%~dp0"
node server/dev-server.mjs --content-editor
pause
