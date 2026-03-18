#!/bin/sh
# Git post-commit hook o'rnatish - har commitdan keyin avtomatik push
cp scripts/post-commit .git/hooks/post-commit
chmod +x .git/hooks/post-commit
echo "Hook o'rnatildi. Endi har git commit qilganda avtomatik push bo'ladi."
