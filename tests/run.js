import path from 'path';
import { analyzeProject } from '../src/analyzer.js';

async function runTests() {
  console.log("Running Orphix tests...");

  const fixtureDir = path.resolve('tests/fixtures/simple-project');
  const entryPoint = path.join(fixtureDir, 'index.js');

  const results = await analyzeProject(fixtureDir, {
    entryPoints: [entryPoint]
  });

  let failed = false;

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
    if (unusedImp.confidence === 99) {
      console.log("✅ Correctly calculated confidence for unused import (99%).");
    } else {
      console.error("❌ Incorrect confidence for unused import. Got:", unusedImp.confidence);
      failed = true;
    }
  } else {
    console.error("❌ Failed to identify unused import 'unusedExport' in index.js. Found:", results.unusedImports);
    failed = true;
  }

  // 2. Verify Unused Exports
  const subtractExport = results.unusedExports.find(e => e.name === 'subtract' && e.relativeFile === 'used.js');
  if (subtractExport) {
    console.log("✅ Correctly identified unused export 'subtract' in used.js.");
    if (subtractExport.confidence === 99) {
      console.log("✅ Correctly calculated confidence for 'subtract' export (99%).");
    } else {
      console.error("❌ Incorrect confidence for 'subtract' export. Got:", subtractExport.confidence);
      failed = true;
    }
  } else {
    console.error("❌ Failed to identify unused export 'subtract' in used.js. Found:", results.unusedExports);
    failed = true;
  }

  // 3. Verify Unused Functions
  const helperFn = results.unusedFunctions.find(f => f.name === 'helperFunction' && f.relativeFile === 'used.js');
  if (helperFn) {
    console.log("✅ Correctly identified unused function 'helperFunction' in used.js.");
    if (helperFn.confidence === 99) {
      console.log("✅ Correctly calculated confidence for 'helperFunction' function (99%).");
    } else {
      console.error("❌ Incorrect confidence for 'helperFunction' function. Got:", helperFn.confidence);
      failed = true;
    }
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
