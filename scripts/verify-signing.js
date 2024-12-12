const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const yaml = require('js-yaml');

function runCommand(command) {
    try {
        const result = execSync(command, { 
            encoding: 'utf8', 
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        return result.toString().trim();
    } catch (error) {
        console.error(`Command failed: ${command}`);
        console.error(error.message);
        return error.message;
    }
}

async function verifyElectronBuilder() {
    console.log('\nChecking electron-builder configuration...');
    
    const configPath = path.resolve(__dirname, '../electron-builder.yml');
    try {
        const config = yaml.load(fs.readFileSync(configPath, 'utf8'));
        console.log('[PASS] electron-builder.yml is valid');
        console.log(`- appId: ${config.appId}`);
        console.log(`- productName: ${config.productName}`);
        return true;
    } catch (error) {
        console.error('[FAIL] Invalid electron-builder.yml:', error.message);
        return false;
    }
}

async function verifyNotarizeScript() {
    console.log('\nChecking notarize script...');
    
    const scriptPath = path.resolve(__dirname, 'notarize.js');
    try {
        await fs.promises.access(scriptPath);
        console.log('[PASS] notarize.js exists');
        return true;
    } catch (error) {
        console.error('[FAIL] notarize.js not found');
        return false;
    }
}

async function verifyEntitlements() {
    console.log('\nChecking entitlements files...');
    
    const files = [
        'assets/entitlements.mac.plist',
        'assets/entitlements.mac.inherit.plist'
    ];
    
    for (const file of files) {
        const filePath = path.resolve(__dirname, '..', file);
        try {
            await fs.promises.access(filePath);
            const content = await fs.promises.readFile(filePath, 'utf8');
            if (content.includes('<?xml') && content.includes('</plist>')) {
                console.log(`[PASS] ${file} exists and is valid`);
            } else {
                console.error(`[FAIL] ${file} has invalid format`);
                return false;
            }
        } catch (error) {
            console.error(`[FAIL] ${file} not found`);
            return false;
        }
    }
    return true;
}

async function verifyCertificate() {
    console.log('\nVerifying certificate...');
    
    const certPath = process.env.CSC_LINK;
    if (!certPath) {
        console.error('[FAIL] CSC_LINK not set');
        return false;
    }

    try {
        await fs.promises.access(certPath);
        console.log(`[PASS] Certificate found at: ${certPath}`);
        
        // Create temporary keychain
        const tempKeychainPassword = 'temp123';
        const tempKeychainPath = 'temp.keychain';
        
        try {
            // Create and configure keychain
            runCommand(`security create-keychain -p ${tempKeychainPassword} ${tempKeychainPath}`);
            runCommand(`security unlock-keychain -p ${tempKeychainPassword} ${tempKeychainPath}`);
            runCommand(`security set-keychain-settings -t 3600 -l ${tempKeychainPath}`);
            
            // Import certificate
            const importResult = runCommand(
                `security import "${certPath}" -k ${tempKeychainPath} -P "${process.env.CSC_KEY_PASSWORD}" -T /usr/bin/codesign`
            );
            
            if (!importResult.includes('error')) {
                console.log('[PASS] Certificate import successful');
                
                // List certificates in temp keychain
                const certList = runCommand(`security find-identity -v -p codesigning ${tempKeychainPath}`);
                if (certList.includes('valid identities found')) {
                    console.log('[PASS] Certificate is valid for codesigning');
                    console.log('\nCertificate details:');
                    console.log(certList);
                } else {
                    console.error('[FAIL] No valid signing identities found');
                    return false;
                }
            } else {
                console.error('[FAIL] Certificate import failed');
                return false;
            }
        } finally {
            // Clean up
            runCommand(`security delete-keychain ${tempKeychainPath}`);
        }
        
    } catch (error) {
        console.error('[FAIL] Certificate verification failed:', error.message);
        return false;
    }
    
    return true;
}

async function verifyEnvironment() {
    console.log('\nVerifying environment variables...');
    
    const requiredVars = [
        'CSC_LINK',
        'CSC_KEY_PASSWORD',
        'APPLE_ID',
        'APPLE_ID_PASSWORD',
        'APPLE_APP_SPECIFIC_PASSWORD',
        'APPLE_TEAM_ID',
        'APP_BUNDLE_ID'
    ];
    
    const envStatus = requiredVars.reduce((status, varName) => {
        status[varName] = process.env[varName] ? '[PASS]' : '[FAIL]';
        return status;
    }, {});
    
    console.table(envStatus);
    
    return !Object.values(envStatus).includes('[FAIL]');
}

async function verifySigning() {
    console.log('Starting signing verification...\n');
    
    // Load environment variables
    require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
    
    const checks = [
        { name: 'Environment Variables', fn: verifyEnvironment },
        { name: 'Electron Builder Config', fn: verifyElectronBuilder },
        { name: 'Notarize Script', fn: verifyNotarizeScript },
        { name: 'Entitlements Files', fn: verifyEntitlements },
        { name: 'Certificate', fn: verifyCertificate }
    ];
    
    let success = true;
    
    for (const check of checks) {
        const result = await check.fn();
        if (!result) {
            console.error(`\n[FAIL] ${check.name} check failed`);
            success = false;
            break;
        }
    }
    
    if (success) {
        console.log('\n[PASS] All verification checks passed successfully!');
        return true;
    } else {
        console.error('\n[FAIL] Verification failed. Please fix the issues above.');
        return false;
    }
}

// Run verification
verifySigning().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('Verification failed with error:', error);
    process.exit(1);
});