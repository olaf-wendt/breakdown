#!/bin/bash

# Check if correct number of arguments provided
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <arm64_folder> <x86_64_folder> <output_folder>"
    echo "Example: $0 ./resources/mac-arm64 ./resources/mac-x64 ./resources/mac-universal"
    exit 1
fi

ARM64_DIR="$1"
X86_64_DIR="$2"
OUTPUT_DIR="$3"

# Load environment variables from .env
if [ -f ".env" ]; then
    while IFS='=' read -r key value; do
        if [[ $key != \#* ]] && [ ! -z "$key" ]; then
            value=$(echo "$value" | tr -d '"' | tr -d "'")
            export "$key=$value"
        fi
    done < .env
    echo "Loaded .env file"
else
    echo ".env file not found"
    exit 1
fi

# Get signing identity
if [ ! -z "$CSC_NAME" ]; then
    SIGNING_IDENTITY="$CSC_NAME"
elif [ ! -z "$CSC_LINK" ]; then
    SIGNING_IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | awk -F '"' '{print $2}')
else
    echo "No signing identity found in .env"
    exit 1
fi

echo "Using signing identity: $SIGNING_IDENTITY"

# Function to process files in a directory
process_directory() {
    local arm64_dir="$1"
    local x86_64_dir="$2"
    local output_dir="$3"
    local subdir="$4"
    
    # Create output subdirectory
    mkdir -p "$output_dir/$subdir"
    
    echo "Processing directory: $subdir"
    
    # Process each file in ARM64 directory
    for arm_file in "$arm64_dir/$subdir"/*; do
        if [ -f "$arm_file" ]; then
            filename=$(basename "$arm_file")
            x86_file="$x86_64_dir/$subdir/$filename"
            output_file="$output_dir/$subdir/$filename"
            
            # Check if corresponding x86_64 file exists
            if [ -f "$x86_file" ]; then
                echo "Creating universal binary for $subdir/$filename..."
                
                # Create universal binary
                lipo -create \
                    -arch arm64 "$arm_file" \
                    -arch x86_64 "$x86_file" \
                    -output "$output_file"
                
                # Verify the result
                if [ $? -eq 0 ]; then
                    echo "✓ Successfully created universal binary: $subdir/$filename"
                    echo "  Architecture info: $(lipo -info "$output_file")"
                    
                    # Make writable and update library paths if it's a library
                    chmod +w "$output_file"
                    if [[ "$filename" == *.dylib ]]; then
                        echo "Updating library paths for $filename"
                        install_name_tool -id "@rpath/$filename" "$output_file"
                        
                        # Update dependencies
                        for dep in "$output_dir/lib"/*.dylib; do
                            if [ -f "$dep" ]; then
                                dep_name=$(basename "$dep")
                                current_path=$(otool -L "$output_file" | grep "$dep_name" | awk '{print $1}')
                                if [ ! -z "$current_path" ]; then
                                    install_name_tool -change "$current_path" "@rpath/$dep_name" "$output_file"
                                fi
                            fi
                        done
                    fi
                    
                    # Sign the universal binary
                    echo "Signing $subdir/$filename"
                    codesign --force --timestamp --options runtime \
                        --sign "$SIGNING_IDENTITY" "$output_file"
                    
                    if [ $? -eq 0 ]; then
                        echo "✓ Successfully signed: $subdir/$filename"
                    else
                        echo "✗ Failed to sign: $subdir/$filename"
                    fi
                else
                    echo "✗ Failed to create universal binary for $subdir/$filename"
                fi
            else
                echo "⚠️  Warning: No x86_64 version found for $subdir/$filename"
            fi
        fi
    done
}

# Process bin and lib directories
for subdir in "bin" "lib"; do
    if [ -d "$ARM64_DIR/$subdir" ]; then
        process_directory "$ARM64_DIR" "$X86_64_DIR" "$OUTPUT_DIR" "$subdir"
    else
        echo "Warning: Directory $ARM64_DIR/$subdir not found"
    fi
done

echo "Done!"