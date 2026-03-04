#!/bin/bash
set -euo pipefail

# KubeOps Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/trustspirit/kubeops/main/install.sh | bash

APP_NAME="KubeOps"
INSTALL_DIR="/Applications"
REPO="trustspirit/kubeops"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}==>${NC} $1"; }
ok()    { echo -e "${GREEN}==>${NC} $1"; }
warn()  { echo -e "${YELLOW}==>${NC} $1"; }
error() { echo -e "${RED}==>${NC} $1" >&2; }

cleanup() {
  if [ -n "${TMPDIR_INSTALL:-}" ] && [ -d "$TMPDIR_INSTALL" ]; then
    rm -rf "$TMPDIR_INSTALL"
  fi
}
trap cleanup EXIT

# --- Platform detection ---
OS="$(uname -s)"
ARCH="$(uname -m)"

if [ "$OS" != "Darwin" ]; then
  error "This installer is for macOS only."
  error "For Linux, download the AppImage from: https://github.com/$REPO/releases/latest"
  exit 1
fi

if [ "$ARCH" = "arm64" ]; then
  ARCH_SUFFIX="arm64"
elif [ "$ARCH" = "x86_64" ]; then
  ARCH_SUFFIX="x64"
else
  error "Unsupported architecture: $ARCH"
  exit 1
fi

# --- Fetch latest version ---
info "Fetching latest release..."
LATEST=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/')

if [ -z "$LATEST" ]; then
  error "Failed to fetch latest version. Check your internet connection."
  exit 1
fi

info "Latest version: v$LATEST"

# --- Download ---
DMG_NAME="${APP_NAME}-${LATEST}-${ARCH_SUFFIX}.dmg"
DOWNLOAD_URL="https://github.com/$REPO/releases/download/v${LATEST}/${DMG_NAME}"

TMPDIR_INSTALL="$(mktemp -d)"
DMG_PATH="${TMPDIR_INSTALL}/${DMG_NAME}"

info "Downloading ${DMG_NAME}..."
if ! curl -fSL --progress-bar -o "$DMG_PATH" "$DOWNLOAD_URL"; then
  error "Download failed. URL: $DOWNLOAD_URL"
  exit 1
fi

# --- Mount DMG ---
info "Mounting disk image..."
MOUNT_POINT="$(hdiutil attach -nobrowse -noautoopen "$DMG_PATH" 2>/dev/null | grep '/Volumes/' | sed 's/.*\(\/Volumes\/.*\)/\1/' | head -1)"

if [ -z "$MOUNT_POINT" ] || [ ! -d "$MOUNT_POINT" ]; then
  error "Failed to mount DMG."
  exit 1
fi

# --- Install ---
APP_SRC="$(find "$MOUNT_POINT" -maxdepth 1 -name '*.app' | head -1)"

if [ -z "$APP_SRC" ]; then
  hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
  error "No .app found in DMG."
  exit 1
fi

info "Installing to ${INSTALL_DIR}/${APP_NAME}.app..."

# Remove old version if exists
if [ -d "${INSTALL_DIR}/${APP_NAME}.app" ]; then
  warn "Removing previous installation..."
  rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
fi

cp -R "$APP_SRC" "${INSTALL_DIR}/"

# --- Unmount ---
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true

# --- Remove quarantine (bypass Gatekeeper) ---
info "Removing quarantine attribute..."
xattr -cr "${INSTALL_DIR}/${APP_NAME}.app" 2>/dev/null || true

# --- Done ---
echo ""
ok "${APP_NAME} v${LATEST} installed successfully!"
echo ""
echo "  Open from Finder or run:"
echo "    open -a ${APP_NAME}"
echo ""
