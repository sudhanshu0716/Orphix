#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { analyzeProject } from '../src/analyzer.js';
import { reportResults } from '../src/reporter.js';
import { cleanProject } from '../src/cleaner.js';

import fs from 'fs';

const packageJson = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);

const program = new Command();

program
  .name('orphix')
  .description('Find unused files, exports, functions, and components in your JS/TS codebase')
  .version(packageJson.version)
  .argument('[dir]', 'directory to scan', '.')
  .option('--json', 'output result in JSON format', false)
  .option('--verbose', 'detailed logs', false)
  .option('--fail-on-dead-code', 'exit with code 1 if dead code is found', false)
  .option('--git', 'extract git history metadata (last edit date/author)', false)
  .option('--ignore <patterns...>', 'glob patterns of files to ignore')
  .option('--entry <entryPoints...>', 'explicit entry point files')
  .option('--clean', 'automatically delete unused files and clean up dead code', false)
  .action(async (dir, options) => {
    try {
      const targetDir = path.resolve(dir);
      
      let fileConfig = {};
      const configPath = path.join(targetDir, 'orphix.config.json');
      if (fs.existsSync(configPath)) {
        try {
          fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch (e) {
          console.warn(`Warning: Failed to parse configuration file at ${configPath}: ${e.message}`);
        }
      }

      const config = {
        json: options.json || fileConfig.json || false,
        verbose: options.verbose || fileConfig.verbose || false,
        git: options.git || fileConfig.git || false,
        ignore: options.ignore || fileConfig.ignore,
        entryPoints: options.entry || (fileConfig.entryPoints ? fileConfig.entryPoints.map(e => path.resolve(targetDir, e)) : undefined),
      };

      const results = await analyzeProject(targetDir, config);
      
      reportResults(results, { json: config.json });

      if (options.clean) {
        cleanProject(results, targetDir);
      }

      const failOnDeadCode = options.failOnDeadCode || fileConfig.failOnDeadCode || false;
      if (failOnDeadCode) {
        const totalIssues =
          results.unusedFiles.length +
          results.unusedExports.length +
          results.unusedFunctions.length +
          (results.unusedImports ? results.unusedImports.length : 0) +
          (results.deadApis ? results.deadApis.length : 0);
        if (totalIssues > 0) {
          process.exit(1);
        }
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
