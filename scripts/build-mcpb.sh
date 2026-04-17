#!/bin/bash
# Build .mcpb bundle for Claude Desktop one-click install
# Usage: ./scripts/build-mcpb.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VERSION=$(node -e "console.log(require('./package.json').version)")
BUNDLE_NAME="mcp-obsidian-${VERSION}.mcpb"
BUILD_DIR="${PROJECT_DIR}/.mcpb-build"

echo "Building ${BUNDLE_NAME}..."

# Clean
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Build TypeScript
npm run build

# Copy required files
cp -r dist "$BUILD_DIR/"
cp manifest.json "$BUILD_DIR/"
cp package.json "$BUILD_DIR/"
cp LICENSE "$BUILD_DIR/"
cp README.md "$BUILD_DIR/"

# Install production dependencies only
cd "$BUILD_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null

# Create the bundle
cd "$PROJECT_DIR"
rm -f "$BUNDLE_NAME"
cd "$BUILD_DIR"
zip -r "${PROJECT_DIR}/${BUNDLE_NAME}" . -x "*.DS_Store" > /dev/null

# Clean up
rm -rf "$BUILD_DIR"

echo "Created ${BUNDLE_NAME} ($(du -h "${PROJECT_DIR}/${BUNDLE_NAME}" | cut -f1))"
