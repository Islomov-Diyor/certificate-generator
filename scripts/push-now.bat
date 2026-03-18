@echo off
REM Barcha o'zgarishlarni commit va push qilish
cd /d "%~dp0.."
git add -A
git status
git commit -m "update: %date% %time%" 2>nul || echo Hech qanday o'zgarish yo'q.
git push origin HEAD
