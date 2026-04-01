#!/usr/bin/env bash
set -euo pipefail

# Setup personalfi to auto-start on boot via systemd

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVICE_NAME="personalfi"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root (use sudo)."
  echo "  sudo bash scripts/setup-autostart.sh"
  exit 1
fi

echo "Installing systemd service for PersonalFi..."
echo "  Project directory: ${PROJECT_DIR}"

# Generate service file with correct working directory
sed "s|WORKING_DIR_PLACEHOLDER|${PROJECT_DIR}|g" \
  "${PROJECT_DIR}/scripts/personalfi.service" > "${SERVICE_FILE}"

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl start "${SERVICE_NAME}.service"

echo ""
echo "Done! PersonalFi will now start automatically on boot."
echo "  Status:  systemctl status ${SERVICE_NAME}"
echo "  Logs:    docker compose -f ${PROJECT_DIR}/docker-compose.yml logs -f"
echo "  Disable: sudo systemctl disable ${SERVICE_NAME}"
