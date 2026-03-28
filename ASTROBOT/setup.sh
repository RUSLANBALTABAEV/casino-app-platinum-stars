#!/usr/bin/env bash

set -e

if [ ! -d ".venv" ]; then
  python -m venv .venv
fi

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
  source .venv/Scripts/activate
else
  source .venv/bin/activate
fi

pip install --upgrade pip
pip install -r requirements.txt

echo "Virtual environment ready. Copy env.example to .env and fill in your secrets."

