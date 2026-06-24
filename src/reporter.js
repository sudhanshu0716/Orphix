import pc from 'picocolors';

/**
 * Reports analysis results to console.
 * @param {object} results - analyzer output
 * @param {object} options - reporting configurations
 */
export function reportResults(results, options = {}) {
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const { entryPoints, unusedFiles, unusedExports, unusedFunctions, unusedImports = [], deadApis = [], unusedPackages = [], parseErrors } = results;

  console.log(`\n${pc.bold(pc.cyan('=== Orphix Analysis ==='))}\n`);

  if (entryPoints.length > 0) {
    console.log(pc.bold(pc.green('Entry Points:')));
    entryPoints.forEach(ep => console.log(`  - ${pc.dim(ep)}`));
    console.log();
  }

  const totalIssues = unusedFiles.length + unusedExports.length + unusedFunctions.length + unusedImports.length + deadApis.length + unusedPackages.length;

  if (unusedFiles.length > 0) {
    console.log(pc.bold(pc.red(`Unused Files (${unusedFiles.length})`)));
    console.log(pc.red('--------------------------------------------------'));
    unusedFiles.forEach(f => {
      let gitStr = '';
      if (f.gitInfo) {
        gitStr = pc.dim(` (Last updated ${f.gitInfo.relativeDate} by ${f.gitInfo.author})`);
      }
      console.log(`  ${pc.bold(pc.red(f.relativeFile))}${gitStr}`);
    });
    console.log();
  }

  if (unusedExports.length > 0) {
    console.log(pc.bold(pc.yellow(`Unused Exports (${unusedExports.length})`)));
    console.log(pc.yellow('--------------------------------------------------'));
    unusedExports.forEach(e => {
      let gitStr = '';
      if (e.gitInfo) {
        gitStr = pc.dim(` (Last updated ${e.gitInfo.relativeDate} by ${e.gitInfo.author})`);
      }
      console.log(`  ${pc.bold(e.relativeFile)}:${pc.cyan(e.line)} - Export ${pc.bold(pc.yellow(e.name))}${gitStr}`);
    });
    console.log();
  }

  if (unusedFunctions.length > 0) {
    console.log(pc.bold(pc.magenta(`Unused Functions & React Components (${unusedFunctions.length})`)));
    console.log(pc.magenta('--------------------------------------------------'));
    unusedFunctions.forEach(f => {
      let gitStr = '';
      if (f.gitInfo) {
        gitStr = pc.dim(` (Last updated ${f.gitInfo.relativeDate} by ${f.gitInfo.author})`);
      }
      const typeStr = f.isReactComponent ? pc.cyan('React Component') : pc.green('Function');
      console.log(`  ${pc.bold(f.relativeFile)}:${pc.cyan(f.line)} - Unused ${typeStr}: ${pc.bold(pc.magenta(f.name))}${gitStr}`);
    });
    console.log();
  }

  if (deadApis.length > 0) {
    console.log(pc.bold(pc.blue(`Potentially Dead API Routes (${deadApis.length})`)));
    console.log(pc.blue('--------------------------------------------------'));
    deadApis.forEach(api => {
      let gitStr = '';
      if (api.gitInfo) {
        gitStr = pc.dim(` (Last updated ${api.gitInfo.relativeDate} by ${api.gitInfo.author})`);
      }
      console.log(`  ${pc.bold(api.relativeFile)} - Endpoint ${pc.bold(pc.blue(api.endpoint))}${gitStr}`);
    });
    console.log();
  }

  if (unusedImports.length > 0) {
    console.log(pc.bold(pc.cyan(`Unused Imports (${unusedImports.length})`)));
    console.log(pc.cyan('--------------------------------------------------'));
    unusedImports.forEach(imp => {
      let gitStr = '';
      if (imp.gitInfo) {
        gitStr = pc.dim(` (Last updated ${imp.gitInfo.relativeDate} by ${imp.gitInfo.author})`);
      }
      console.log(`  ${pc.bold(imp.relativeFile)} - Unused Import ${pc.bold(pc.cyan(imp.name))} from "${imp.source}"${gitStr}`);
    });
    console.log();
  }

  if (unusedPackages.length > 0) {
    console.log(pc.bold(pc.red(`Unused npm Dependencies (${unusedPackages.length})`)));
    console.log(pc.red('--------------------------------------------------'));
    unusedPackages.forEach(pkg => {
      const rootStr = pkg.relativeRoot !== '.' ? ` (in ${pkg.relativeRoot})` : '';
      console.log(`  ${pc.bold(pc.red(pkg.package))}${rootStr}`);
    });
    console.log();
  }

  if (parseErrors.length > 0) {
    console.log(pc.bold(pc.red(`Errors during parsing (${parseErrors.length})`)));
    console.log(pc.red('--------------------------------------------------'));
    parseErrors.forEach(e => {
      console.log(`  ${pc.bold(e.file)}: ${pc.red(e.error)}`);
    });
    console.log();
  }

  if (totalIssues === 0) {
    console.log(pc.bold(pc.green('🎉 Success! No dead files, unused exports, or dead functions found.')));
  } else {
    console.log(pc.bold(pc.yellow(`⚠️ Found a total of ${totalIssues} dead code items.`)));
    console.log(pc.dim('Tip: Check the files above. You can safely remove these or double-check imports.'));
  }
  console.log();
}
