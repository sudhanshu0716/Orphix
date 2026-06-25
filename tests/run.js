import path from 'path';
import fs from 'fs';
import { analyzeProject } from '../src/analyzer.js';

async function runTests() {
  console.log("Running Orphix tests...");

  const fixtureDir = path.resolve('tests/fixtures/simple-project');
  const entryPoint = path.join(fixtureDir, 'index.js');

  // Create temporary config files to verify they are ignored/protected
  const tempConfigFiles = [
    path.join(fixtureDir, '.eslintrc.js'),
    path.join(fixtureDir, 'vite.config.ts'),
    path.join(fixtureDir, 'webpack.mix.js'),
    path.join(fixtureDir, 'my-custom.config.js'),
  ];
  for (const file of tempConfigFiles) {
    fs.writeFileSync(file, 'export default {};');
  }

  let results;
  let failed = false;
  try {
    results = await analyzeProject(fixtureDir, {
      entryPoints: [entryPoint]
    });
  } finally {
    for (const file of tempConfigFiles) {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
    }
  }

  // 1. Verify Unused Files
  if (results.unusedFiles.length === 0) {
    console.log("✅ Correctly resolved all files as reachable.");
  } else {
    console.error("❌ Expected no unused files, but found:", results.unusedFiles);
    failed = true;
  }

  // 1b. Verify Unused Imports
  const unusedImp = results.unusedImports.find(imp => imp.name === 'unusedExport' && imp.relativeFile === 'index.js');
  if (unusedImp) {
    console.log("✅ Correctly identified unused import 'unusedExport' in index.js.");
  } else {
    console.error("❌ Failed to identify unused import 'unusedExport' in index.js. Found:", results.unusedImports);
    failed = true;
  }

  // 2. Verify Unused Exports
  const subtractExport = results.unusedExports.find(e => e.name === 'subtract' && e.relativeFile === 'used.js');
  if (subtractExport) {
    console.log("✅ Correctly identified unused export 'subtract' in used.js.");
  } else {
    console.error("❌ Failed to identify unused export 'subtract' in used.js. Found:", results.unusedExports);
    failed = true;
  }

  // 3. Verify Unused Functions
  const helperFn = results.unusedFunctions.find(f => f.name === 'helperFunction' && f.relativeFile === 'used.js');
  if (helperFn) {
    console.log("✅ Correctly identified unused function 'helperFunction' in used.js.");
  } else {
    console.error("❌ Failed to identify unused function 'helperFunction' in used.js. Found:", results.unusedFunctions);
    failed = true;
  }

  // 4. Run Next.js API detection test
  const nextFixtureDir = path.resolve('tests/fixtures/next-project');
  const nextResults = await analyzeProject(nextFixtureDir);
  
  const deadApi = nextResults.deadApis.find(api => api.endpoint === '/api/items');
  const usedApi = nextResults.deadApis.find(api => api.endpoint === '/api/users');

  if (deadApi && !usedApi) {
    console.log("✅ Correctly identified dead API /api/items and kept /api/users.");
  } else {
    console.error("❌ API Route detection failed. Found deadApis:", nextResults.deadApis);
    failed = true;
  }

  // 5. Run barrel re-export propagation test
  const barrelFixtureDir = path.resolve('tests/fixtures/barrel-project');
  const barrelResults = await analyzeProject(barrelFixtureDir, {
    entryPoints: [path.join(barrelFixtureDir, 'app.js')]
  });

  const unusedIndexBar = barrelResults.unusedExports.find(e => e.name === 'bar' && e.relativeFile === 'index.js');
  const unusedSubmoduleBar = barrelResults.unusedExports.find(e => e.name === 'bar' && e.relativeFile === 'submodule.js');
  const unusedIndexFoo = barrelResults.unusedExports.find(e => e.name === 'foo');

  if (unusedIndexBar && unusedSubmoduleBar && !unusedIndexFoo) {
    console.log("✅ Correctly propagated re-export usage: 'foo' is used and 'bar' is unused.");
  } else {
    console.error("❌ Barrel re-export propagation test failed. Found unusedExports:", barrelResults.unusedExports);
    failed = true;
  }

  // 6. Run monorepo project test (client/server auto-detection)
  const monorepoFixtureDir = path.resolve('tests/fixtures/monorepo-project');
  const monorepoResults = await analyzeProject(monorepoFixtureDir);

  const unusedFilesList = monorepoResults.unusedFiles.map(f => f.relativeFile.replace(/\\/g, '/'));
  const expectedUnused = 'server/src/unused.js';
  const unexpectedUnused = ['client/src/App.jsx', 'client/src/main.jsx', 'server/src/server.js', 'server/src/db.js'];

  const hasExpected = unusedFilesList.includes(expectedUnused);
  const hasUnexpected = unexpectedUnused.some(f => unusedFilesList.includes(f));

  const hasUnusedPkg = monorepoResults.unusedPackages.some(p => p.package === 'lodash' && p.relativeRoot.replace(/\\/g, '/') === 'server');

  if (hasExpected && !hasUnexpected && hasUnusedPkg) {
    console.log("✅ Correctly handled monorepo/client-server: only 'server/src/unused.js' is unused and 'lodash' is flagged as unused package dependency.");
  } else {
    console.error("❌ Monorepo client-server auto-detection failed. Found unused files:", unusedFilesList, "Found unused packages:", monorepoResults.unusedPackages);
    failed = true;
  }

  // 7. Robustness and Bug Fixes verification (TS, aliases, destructuring, side-effect preservation)
  const robustnessFixtureDir = path.resolve('tests/fixtures/robustness-project');
  const robustnessResults = await analyzeProject(robustnessFixtureDir, {
    entryPoints: [path.join(robustnessFixtureDir, 'index.ts')]
  });

  const robustnessUnusedList = robustnessResults.unusedFiles.map(f => f.relativeFile.replace(/\\/g, '/'));
  
  // Verify dynamic import dir walk-up doesn't make unused-file.js reachable (should be unused)
  if (robustnessUnusedList.includes('unused-file.js')) {
    console.log("✅ Dynamic import path resolver restricted correctly (no walk-up over-reachability).");
  } else {
    console.error("❌ Dynamic import path resolver failed (walked up and marked unused-file.js as reachable).");
    failed = true;
  }

  // Verify companion stylesheet detection
  const unusedFileData = robustnessResults.unusedFiles.find(f => f.relativeFile.replace(/\\/g, '/') === 'unused-file.js');
  const hasCompanionStyle = unusedFileData && unusedFileData.companionFiles && unusedFileData.companionFiles.some(c => c.relativeFile.replace(/\\/g, '/') === 'unused-file.css');
  if (hasCompanionStyle) {
    console.log("✅ Successfully identified companion stylesheet for unused JS/TS file.");
  } else {
    console.error("❌ Failed to identify companion stylesheet for unused JS/TS file.");
    failed = true;
  }

  // Verify jsconfig paths mapping resolved utils/math.ts as reachable
  const mathIsReachable = !robustnessUnusedList.includes('utils/math.ts');
  if (mathIsReachable) {
    console.log("✅ Successfully resolved custom tsconfig/jsconfig path aliases.");
  } else {
    console.error("❌ Failed to resolve custom tsconfig/jsconfig path aliases.");
    failed = true;
  }

  // Verify TS type-only import was tracked correctly (UserInfo not flagged as unused import in index.ts)
  const isTypeImportUnused = robustnessResults.unusedImports.some(imp => imp.name === 'UserInfo');
  if (!isTypeImportUnused) {
    console.log("✅ Successfully tracked TypeScript type annotations and interfaces.");
  } else {
    console.error("❌ Failed to track TypeScript type annotations (falsely flagged UserInfo type as unused).");
    failed = true;
  }

  // Verify destructured exports: 'sub' and 'div' should be flagged as unused exports, but 'add' should not be.
  const isAddUnused = robustnessResults.unusedExports.some(e => e.name === 'add');
  const isSubUnused = robustnessResults.unusedExports.some(e => e.name === 'sub');
  const isDivUnused = robustnessResults.unusedExports.some(e => e.name === 'div');
  if (!isAddUnused && isSubUnused && isDivUnused) {
    console.log("✅ Successfully parsed destructured (object and array) exports.");
  } else {
    console.error("❌ Failed to parse destructured exports. add unused: " + isAddUnused + ", sub unused: " + isSubUnused + ", div unused: " + isDivUnused);
    failed = true;
  }

  if (failed) {
    console.error("❌ Tests failed!");
    process.exit(1);
  } else {
    console.log("🎉 All tests passed successfully!");
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error("Fatal error during testing:", err);
  process.exit(1);
});
