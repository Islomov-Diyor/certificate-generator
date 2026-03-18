@echo off
REM Git post-commit hook o'rnatish - har commitdan keyin avtomatik push
cd /d "%~dp0.."
copy /Y "scripts\post-commit" ".git\hooks\post-commit"
echo Hook o'rnatildi. Endi har git commit qilganda avtomatik push bo'ladi.
