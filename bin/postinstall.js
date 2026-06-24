#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// INIT_CWD is set by npm to the directory where the user executed "npm install".
const projectDir = process.env.INIT_CWD;

if (projectDir) {
  const packageJsonPath = path.join(projectDir, 'package.json');
  
  // Verify we are not modifying Orphix's own package.json during development
  const orphixPackageJsonPath = path.resolve(new URL(import.meta.url).pathname, '../../package.json');
  
  if (fs.existsSync(packageJsonPath) && path.resolve(packageJsonPath) !== path.resolve(orphixPackageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      // Ensure scripts block exists
      if (!packageJson.scripts) {
        packageJson.scripts = {};
      }
      
      let modified = false;
      
      // Add orphix commands to their local scripts if they do not exist
      if (!packageJson.scripts.orphix) {
        packageJson.scripts.orphix = 'orphix';
        modified = true;
      }
      if (!packageJson.scripts['orphix:clean']) {
        packageJson.scripts['orphix:clean'] = 'orphix --clean';
        modified = true;
      }
      
      if (modified) {
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
        console.log('\x1b[32m%s\x1b[0m', '🕵️‍♂️ [Orphix] Automatically added "orphix" and "orphix:clean" to your package.json scripts!');
        console.log('           You can now run: \x1b[36mnpm run orphix\x1b[0m or \x1b[36mnpm run orphix:clean\x1b[0m\n');
      }
    } catch (e) {
      // Fail silently to avoid breaking the user's install process
    }
  }
}
