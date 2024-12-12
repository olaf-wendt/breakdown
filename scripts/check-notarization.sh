#!/bin/bash

# Check if an app path was provided
if [ -z "$1" ]; then
    echo "Usage: $0 /path/to/YourApp.app"
    exit 1
fi

APP_PATH="$1"

# Check if the app exists
if [ ! -d "$APP_PATH" ]; then
    echo "Error: App not found at $APP_PATH"
    exit 1
fi

echo "Checking app at: $APP_PATH"
echo "------------------------"

# Check code signing
echo "1. Basic signature verification:"
codesign -v "$APP_PATH"
echo ""

echo "2. Detailed signature information:"
codesign -dvv "$APP_PATH"
echo ""

echo "3. Deep verification (all components):"
codesign -dvv --deep "$APP_PATH"
echo ""

echo "4. Gatekeeper assessment:"
spctl --assess -vv "$APP_PATH"
echo ""

echo "5. Bundle signature verification:"
pkgutil --check-signature "$APP_PATH"
echo ""

echo "6. Entitlements check:"
codesign -d --entitlements :- "$APP_PATH"
echo ""

# Check notarization status
echo "7. Notarization status:"
xcrun stapler validate "$APP_PATH"
echo ""

# Final summary
echo "------------------------"
echo "Summary:"
if codesign -v "$APP_PATH" 2>/dev/null; then
    echo "✅ Code signing: Valid"
else
    echo "❌ Code signing: Invalid"
fi

if spctl --assess -v "$APP_PATH" 2>/dev/null; then
    echo "✅ Gatekeeper: Approved"
else
    echo "❌ Gatekeeper: Not approved"
fi

if xcrun stapler validate "$APP_PATH" 2>/dev/null; then
    echo "✅ Notarization: Valid"
else
    echo "❌ Notarization: Not found or invalid"
fi