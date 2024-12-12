@echo off

:: Create directories
mkdir "resources\win32\bin" 2>nul
mkdir "resources\win32\lib" 2>nul

:: Copy binaries from MSYS2
copy "C:\msys64\mingw64\bin\pdf*.exe" "resources\win32\bin\"

:: Copy required DLLs
copy "C:\msys64\mingw64\bin\libpoppler*.dll" "resources\win32\lib\"
copy "C:\msys64\mingw64\bin\libfreetype*.dll" "resources\win32\lib\"
copy "C:\msys64\mingw64\bin\libfontconfig*.dll" "resources\win32\lib\"
copy "C:\msys64\mingw64\bin\libjpeg*.dll" "resources\win32\lib\"
copy "C:\msys64\mingw64\bin\libpng*.dll" "resources\win32\lib\"
copy "C:\msys64\mingw64\bin\zlib*.dll" "resources\win32\lib\"

echo Poppler binaries and libraries copied successfully