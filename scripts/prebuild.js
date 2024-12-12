const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

async function rebuildSharp() {
  console.log('Rebuilding sharp for multiple architectures...');
  
  try {
    // Rebuild for x64
    console.log('Building for x64...');
    execSync('npm rebuild sharp --platform=darwin --arch=x64', { stdio: 'inherit' });
    
    // Rebuild for arm64
    console.log('Building for arm64...');
    execSync('npm rebuild sharp --platform=darwin --arch=arm64', { stdio: 'inherit' });
    
    console.log('Sharp rebuild complete');
  } catch (error) {
    console.error('Error rebuilding sharp:', error);
    process.exit(1);
  }
}

rebuildSharp();