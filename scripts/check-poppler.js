const { execSync } = require('child_process');
const os = require('os');

function checkPoppler() {
    const platform = os.platform();
    
    try {
        if (platform === 'darwin') {
            execSync('which pdftoppm');
            console.log('Poppler found on macOS');
        } else if (platform === 'win32') {
            try {
                execSync('where pdftoppm');
                console.log('Poppler found on Windows');
            } catch {
                console.log('Poppler not found, checking MSYS2...');
                // Check MSYS2 path
                execSync('C:\\msys64\\mingw64\\bin\\pdftoppm.exe --version');
                console.log('Poppler found in MSYS2');
            }
        }
    } catch (error) {
        console.error('Poppler not found!');
        console.error('Please install poppler:');
        if (platform === 'darwin') {
            console.error('  brew install poppler');
        } else if (platform === 'win32') {
            console.error('  1. Install MSYS2 from https://www.msys2.org/');
            console.error('  2. Run: pacman -S mingw-w64-x86_64-poppler');
        }
        process.exit(1);
    }
}

checkPoppler();