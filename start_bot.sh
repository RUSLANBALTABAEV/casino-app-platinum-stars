#!/bin/bash
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
cd /root/casino-app/ASTROBOT

# Попытка найти Python
for py in python3.12 python3.11 python3.10 python3.9 python3.8 python3; do
    if command -v $py >/dev/null 2>&1; then
        echo "Using $py"
        $py bot.py
        exit $?
    fi
done

# Если не найден, попробуем найти в системе
PYTHON=$(find /usr/bin /usr/local/bin -name python3* -type f 2>/dev/null | head -1)
if [ -n "$PYTHON" ] && [ -x "$PYTHON" ]; then
    echo "Using $PYTHON"
    $PYTHON bot.py
    exit $?
fi

echo "ERROR: Python not found"
exit 1
