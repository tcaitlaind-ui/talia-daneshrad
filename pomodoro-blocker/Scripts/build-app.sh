#!/bin/bash
# Builds PomodoroBlocker and packages it as a proper .app bundle so macOS
# treats it as a real application (Dock/menu-bar behavior, notifications,
# ability to add it to Login Items).
set -euo pipefail

cd "$(dirname "$0")/.."

APP_NAME="PomodoroBlocker"
BUILD_DIR=".build/release"
APP_DIR="${APP_NAME}.app"

echo "Building release binary..."
swift build -c release

echo "Assembling ${APP_DIR}..."
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS"
cp "${BUILD_DIR}/${APP_NAME}" "${APP_DIR}/Contents/MacOS/${APP_NAME}"

cat > "${APP_DIR}/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>Pomodoro Blocker</string>
    <key>CFBundleIdentifier</key>
    <string>com.taliadaneshrad.pomodoroblocker</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSUIElement</key>
    <true/>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSHumanReadableCopyright</key>
    <string>Personal use</string>
</dict>
</plist>
PLIST

echo "Ad-hoc signing..."
codesign --force --deep --sign - "${APP_DIR}"

echo ""
echo "Done. Move ${APP_DIR} into /Applications, then open it (right-click > Open the first time)."
echo "To launch it automatically at login: System Settings > General > Login Items > add ${APP_DIR}."
