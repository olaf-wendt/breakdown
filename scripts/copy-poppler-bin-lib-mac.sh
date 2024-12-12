mkdir -p resources/mac-arm64/bin resources/mac-arm64/lib

# Copy binaries from Homebrew
cp /opt/homebrew/bin/pdf* resources/mac-arm64/bin/

# Copy required libraries
cp "/opt/homebrew/Cellar/gpgme/1.24.0_1/lib/libgpgme.11.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/Cellar/libxcb/1.17.0/lib/libxcb.1.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/Cellar/nspr/4.36/lib/libnspr4.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/Cellar/nss/3.107/lib/libnss3.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/Cellar/nss/3.107/lib/libnssutil3.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/bin/pdfinfo" resources/mac-arm64/lib/
cp "/opt/homebrew/bin/pdftocairo" resources/mac-arm64/lib/
cp "/opt/homebrew/bin/pdftoppm" resources/mac-arm64/lib/
cp "/opt/homebrew/bin/pdftops" resources/mac-arm64/lib/
cp "/opt/homebrew/lib/libpoppler.143.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/cairo/lib/libcairo.2.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/fontconfig/lib/libfontconfig.1.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/freetype/lib/libfreetype.6.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/gettext/lib/libintl.8.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/gpgme/lib/libgpgme.11.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/gpgme/lib/libgpgmepp.6.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/jpeg-turbo/lib/libjpeg.8.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libassuan/lib/libassuan.9.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libgpg-error/lib/libgpg-error.0.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libpng/lib/libpng16.16.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libtiff/lib/libtiff.6.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libx11/lib/libX11.6.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libxau/lib/libXau.6.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libxcb/lib/libxcb-render.0.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libxcb/lib/libxcb-shm.0.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libxcb/lib/libxcb.1.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libxdmcp/lib/libXdmcp.6.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libxext/lib/libXext.6.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/libxrender/lib/libXrender.1.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/little-cms2/lib/liblcms2.2.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/nspr/lib/libnspr4.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/nspr/lib/libplc4.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/nspr/lib/libplds4.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/nss/lib/libnss3.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/nss/lib/libnssutil3.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/nss/lib/libsmime3.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/nss/lib/libssl3.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/openjpeg/lib/libopenjp2.7.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/pixman/lib/libpixman-1.0.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/poppler/lib/libpoppler.143.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/xz/lib/liblzma.5.dylib" resources/mac-arm64/lib/
cp "/opt/homebrew/opt/zstd/lib/libzstd.1.dylib" resources/mac-arm64/lib/

echo Poppler binaries and libraries copied successfully

# Load environment variables from .env
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

# Debug: Show loaded variables (excluding passwords)
echo "Loaded environment variables:"
echo "CSC_LINK=$CSC_LINK"
echo "APPLE_ID=$APPLE_ID"
echo "APPLE_TEAM_ID=$APPLE_TEAM_ID"
echo "APP_BUNDLE_ID=$APP_BUNDLE_ID"

# Use CSC_NAME from .env if it exists, otherwise fall back to CSC_LINK
if [ ! -z "$CSC_NAME" ]; then
    SIGNING_IDENTITY="$CSC_NAME"
elif [ ! -z "$CSC_LINK" ]; then
    # Extract the identity from the p12 file
    SIGNING_IDENTITY=$(security find-identity -v -p codesigning "$CSC_LINK" | grep "Developer ID Application" | awk -F '"' '{print $2}')
else
    echo "No signing identity found in .env"
    exit 1
fi

echo "Using signing identity: $SIGNING_IDENTITY"


cd resources/mac-arm64/lib

# Update each library to use @rpath
for lib in *.dylib; do
    chmod +w "$lib"
    
    # Change the ID of the library
    install_name_tool -id "@rpath/$lib" "$lib"
    
    # Update the dependencies of each library to use @rpath
    for dep in *.dylib; do
        current_path=$(otool -L "$lib" | grep "$dep" | awk '{print $1}')
        if [ ! -z "$current_path" ]; then
            install_name_tool -change "$current_path" "@rpath/$dep" "$lib"
        fi
    done
    echo "Signing library: $lib"
    codesign --force --timestamp --options runtime \
        --sign "$SIGNING_IDENTITY" "$lib"
done

# Update binaries in bin directory
cd ../bin
for bin in *; do
    chmod +w "$bin"
    
    # Update the dependencies of each binary to use @rpath
    for lib in ../lib/*.dylib; do
        lib_name=$(basename "$lib")
        current_path=$(otool -L "$bin" | grep "$lib_name" | awk '{print $1}')
        if [ ! -z "$current_path" ]; then
            install_name_tool -change "$current_path" "@rpath/$lib_name" "$bin"
        fi
    done
    echo "Signing binary: $bin"
    codesign --force --timestamp --options runtime \
        --sign "$SIGNING_IDENTITY" "$bin"
done
