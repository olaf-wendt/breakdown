const fs = require('fs-extra');
const path = require('path');

async function copyServer() {
  const serverDist = path.join(__dirname, '../build/server');
  
  await fs.ensureDir(serverDist);
  await fs.copy(path.join(__dirname, '../../server/src'), path.join(serverDist, 'src'));
  await fs.copy(path.join(__dirname, '../../server/lang-data'), path.join(serverDist, 'lang-data'));
  await fs.copy(path.join(__dirname, '../../server/package.json'), path.join(serverDist, 'package.json'));
}

copyServer().catch(err => {
  console.error('Failed to copy server files:', err);
  process.exit(1);
});