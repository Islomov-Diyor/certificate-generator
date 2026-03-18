# Avtomatik GitHub push

## 1. Post-commit hook (har commitdan keyin avtomatik push)

**Windows:**
```
scripts\setup-auto-push.bat
```

**Linux/Mac:**
```bash
bash scripts/setup-auto-push.sh
```

O'rnatilgandan keyin: `git commit` qilganda avtomatik `git push` ishlaydi.

## 2. Tez push (barcha o'zgarishlarni bir zumda yuborish)

**Windows:**
```
scripts\push-now.bat
```

Bu script: `git add -A` → `git commit` → `git push` qiladi.

## 3. PythonAnywhere'da yangilash

Console'da:
```bash
cd ~/certificate-generator-main   # yoki loyiha papangiz
git pull origin main
```
