const path = require('path');
const fs = require('fs');

// Read .env file
const envPath = path.resolve(__dirname, '../../.env');
console.log('Looking for .env at:', envPath);

try {
    const envFile = fs.readFileSync(envPath, 'utf8');
    console.log('\n.env file contents:');
    console.log(envFile);
} catch (error) {
    console.error('Error reading .env file:', error);
}

// Check environment variables
console.log('\nEnvironment variables:');
console.log({
    CSC_LINK: process.env.CSC_LINK || '(not set)',
    CSC_KEY_PASSWORD: process.env.CSC_KEY_PASSWORD ? '(set)' : '(not set)',
    APPLE_ID: process.env.APPLE_ID || '(not set)',
    APPLE_TEAM_ID: process.env.APPLE_TEAM_ID || '(not set)',
    APP_BUNDLE_ID: process.env.APP_BUNDLE_ID || '(not set)'
});