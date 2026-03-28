#!/bin/bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
cd /root/casino-app/ASTROBOT

# Попытка найти python
PYTHON=$(which python3.12 2>/dev/null || which python3 2>/dev/null || find /usr/bin -name python3* -type f 2>/dev/null | head -1)

if [ -z "$PYTHON" ]; then
    echo "Python not found, trying to install..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update && apt-get install -y python3 python3-pip
    fi
    PYTHON=$(which python3)
fi

if [ -n "$PYTHON" ] && [ -x "$PYTHON" ]; then
    $PYTHON bot.py
else
    echo "ERROR: Python not found"
    exit 1
fi
