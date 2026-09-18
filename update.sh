#!/bin/bash
echo "Starting update for Voice Automation..."

cd "$(dirname "$0")" || exit

# 1. Pull latest code
git pull origin main

# 2. Rebuild and restart containers in detached mode
docker compose up -d --build

# 3. Clean up dangling images to save disk space
docker image prune -f

echo "Update Complete!"
