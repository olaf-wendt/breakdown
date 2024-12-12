const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

exports.default = async function(context) {
  const serverPath = path.join(context.appOutDir, 'resources', 'server');
  console.log('Setting up server dependencies in:', serverPath);
  
  // Copy server's package.json
  await fs.copy(
    path.join(process.cwd(), '..', 'server', 'package.json'),
    path.join(serverPath, 'package.json')
  );

  // Install all dependencies from package.json
  execSync('npm install --production', {
    cwd: serverPath,
    stdio: 'inherit'
  });

  // Reinstall native modules with platform-specific binaries
  const platform = process.platform;
  const arch = process.arch;
  
  const nativeModules = ['sharp', 'pdf-poppler'];
  for (const mod of nativeModules) {
    console.log(`Reinstalling ${mod} for ${platform}-${arch}`);
    execSync(`npm install --platform=${platform} --arch=${arch} ${mod} --include=optional`, {
      cwd: serverPath,
      stdio: 'inherit'
    });
  }
}