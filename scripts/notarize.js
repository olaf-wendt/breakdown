// notarize.js
const { notarize } = require('@electron/notarize');
const log = require('electron-log');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    log.info('Skipping notarization - not macOS');
    return;
  }

  // Check if notarization should be skipped
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    log.info('Skipping notarization - CSC_IDENTITY_AUTO_DISCOVERY is false');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;
  const appBundleId = 'com.olafwendt.breakdown';


  // Ensure required environment variables are present
  const requiredVars = {
    APPLE_ID: process.env.APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    APP_BUNDLE_ID: process.env.APP_BUNDLE_ID,
    APPLE_TEAM_ID: process.env.APPLE_TEAM_ID
  };

  const missingVars = Object.entries(requiredVars)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    log.error('Missing required environment variables:', missingVars.join(', '));
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  log.info(`Notarizing ${requiredVars.APP_BUNDLE_ID} found at ${appPath}`);

  try {
    await notarize({
      tool: 'notarytool',
      appPath: appPath,
      appBundleId: requiredVars.APP_BUNDLE_ID,
      appleId: requiredVars.APPLE_ID,
      appleIdPassword: requiredVars.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: requiredVars.APPLE_TEAM_ID
    });
    console.log('Notarization complete');
  } catch (error) {
    console.error('Notarization failed:', error);
    throw error;
  }
}