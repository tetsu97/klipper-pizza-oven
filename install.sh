#!/bin/bash

# Klipper PIZZA Oven Installation Script
# This script automates the installation and setup of the web application as a systemd service.

# --- Style Definitions ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- Stop on error ---
set -e

echo -e "${BLUE}Starting Klipper PIZZA Oven installation...${NC}"

# --- Check for root privileges for systemd setup ---
if [ "$EUID" -eq 0 ]; then
  echo -e "${YELLOW}Warning: It's recommended to run this script without sudo. It will ask for your password when needed.${NC}"
fi

# --- Find project directory ---
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
cd "$SCRIPT_DIR"

echo -e "Project directory found at: ${GREEN}$SCRIPT_DIR${NC}"

# --- Step 1: Install System Dependencies ---
echo -e "\n${BLUE}Checking for system dependencies (git, python3-venv)...${NC}"
sudo apt update
sudo apt install -y git python3-pip python3-venv

# --- Step 2: Set Up Python Virtual Environment ---
if [ ! -d "venv" ]; then
    echo -e "\n${BLUE}Creating Python virtual environment...${NC}"
    python3 -m venv venv
else
    echo -e "\n${BLUE}Python virtual environment already exists.${NC}"
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies from requirements.txt..."
pip install -r requirements.txt

echo -e "${GREEN}Python environment is ready.${NC}"

# --- Step 3: Set up the systemd Service ---
SERVICE_NAME="klipper-pizza-oven"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"

# Get the current user, fall back to 'pi' if detection fails
CURRENT_USER=$(whoami)
if [ -z "$CURRENT_USER" ]; then
    CURRENT_USER="pi"
    echo -e "${YELLOW}Could not detect user. Defaulting to 'pi'. Please check the service file if this is incorrect.${NC}"
fi

echo -e "\n${BLUE}Creating systemd service file at ${SERVICE_FILE}...${NC}"

# Using tee with sudo to write the service file
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Klipper PIZZA Oven Web Interface
After=network.target moonraker.service

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${SCRIPT_DIR}
ExecStart=${SCRIPT_DIR}/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8123
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}Service file created successfully.${NC}"

# --- Step 4: Enable and Start the Service ---
echo -e "\n${BLUE}Reloading systemd, enabling and starting the service...${NC}"
sudo systemctl daemon-reload
sudo systemctl enable "${SERVICE_NAME}.service"
sudo systemctl start "${SERVICE_NAME}.service"

# --- Step 5: Final Status ---
IP_ADDR=$(hostname -I | awk '{print $1}')
echo -e "\n${GREEN}=======================================================${NC}"
echo -e "${GREEN}      Klipper PIZZA Oven Installation Complete!      ${NC}"
echo -e "${GREEN}=======================================================${NC}"
echo -e "The web interface should now be running."
echo -e "You can access it at: ${YELLOW}http://${IP_ADDR}:8123${NC}"
echo ""
echo -e "To check the status of the service, run:"
echo -e "${BLUE}sudo systemctl status ${SERVICE_NAME}${NC}"
echo ""
echo -e "To view live logs, run:"
echo -e "${BLUE}sudo journalctl -u ${SERVICE_NAME} -f${NC}"
echo ""