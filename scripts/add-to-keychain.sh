if [ -f ".env" ]; then
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        if [[ $key != \#* ]] && [ ! -z "$key" ]; then
            # Remove any quotes from the value
            value=$(echo "$value" | tr -d '"' | tr -d "'")
            # Export the variable
            export "$key=$value"
        fi
    done < .env
    echo "Loaded .env file"
else
    echo ".env file not found"
    exit 1
fi

echo "Loaded environment variables:"
echo "CSC_LINK=$CSC_LINK"
echo "APPLE_ID=$APPLE_ID"
echo "APPLE_TEAM_ID=$APPLE_TEAM_ID"
echo "APP_BUNDLE_ID=$APP_BUNDLE_ID"

# Import certificate if CSC_LINK exists
if [ ! -z "$CSC_LINK" ] && [ ! -z "$CSC_KEY_PASSWORD" ]; then
    echo "Importing certificate from $CSC_LINK"
    security import "$CSC_LINK" -P "$CSC_KEY_PASSWORD" -k ~/Library/Keychains/login.keychain-db -T /usr/bin/codesign
    
    # Unlock keychain if needed
    security unlock-keychain -p "$USER_PASSWORD" ~/Library/Keychains/login.keychain-db
    
    # Allow codesign to access this certificate without prompting
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$USER_PASSWORD" ~/Library/Keychains/login.keychain-db
fi