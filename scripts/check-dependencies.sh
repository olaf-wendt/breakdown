#!/usr/bin/env bash

# Function to recursively check dependencies
check_dependencies() {
    local lib="$1"
    local indent="$2"
    local processed_file="$3"
    
    # Skip if already processed
    if grep -q "^${lib}$" "$processed_file" 2>/dev/null; then
        return
    fi
    
    # Mark as processed
    echo "$lib" >> "$processed_file"
    
    echo "${indent}Checking $lib"
    
    # Get all dependencies
    otool -L "$lib" | tail -n +2 | awk '{print $1}' | grep -E '^(/opt/homebrew|/usr/local)' | while read -r dep; do
        if [ ! -z "$dep" ]; then
            echo "${indent}  $dep"
            # Recursively check this dependency if it exists
            if [ -f "$dep" ]; then
                check_dependencies "$dep" "$indent  " "$processed_file"
            else
                echo "${indent}  WARNING: File not found: $dep"
            fi
        fi
    done
}

# Create a temporary file to track processed libraries
processed_file=$(mktemp)
trap 'rm -f "$processed_file"' EXIT

# Directory to store required libraries
mkdir -p resources/mac-arm64/lib
mkdir -p resources/mac-arm64/bin

# Start with Poppler binaries
echo "Checking Poppler binaries..."
binaries="/opt/homebrew/bin/pdfinfo
/opt/homebrew/bin/pdftocairo
/opt/homebrew/bin/pdftoppm
/opt/homebrew/bin/pdftops
/opt/homebrew/lib/libpoppler.143.dylib"

# First, find all dependencies
echo "$binaries" | while read -r bin; do
    check_dependencies "$bin" "" "$processed_file"
done

# Now create a list of all unique libraries needed
echo -e "\nRequired libraries:"
grep -E '^(/opt/homebrew|/usr/local)' "$processed_file" | sort | uniq

# Generate copy commands
echo -e "\nCopy commands for your script:"
grep -E '^(/opt/homebrew|/usr/local)' "$processed_file" | sort | uniq | while read -r lib; do
    echo "cp \"$lib\" resources/mac-arm64/lib/"
done

# Generate the binaries copy commands
echo -e "\nBinary copy commands:"
echo "$binaries" | while read -r bin; do
    echo "cp \"$bin\" resources/mac-arm64/bin/"
done