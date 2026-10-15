#!/usr/bin/env node

/**
 * Test Discovery & Completeness Verifier
 * 
 * Verifies:
 * 1. Globs in all package.json test scripts are strictly quoted to avoid shell glob truncation.
 * 2. Compares the exact count and file list of *.test.ts source files against executed test files per package.
 * 3. Enforces that test discovery does not silently omit any test file.
 * 4. Fails with exit code 1 on any discrepancy.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const REPORTER_PATH = path.resolve(__dirname, 'test-reporter-discovery.mjs');

const PACKAGES = [
  { name: '@ledger-ae/ledger-core', dir: 'packages/ledger-core', outputType: 'dist' },
  { name: '@ledger-ae/uae-tax-engine', dir: 'packages/uae-tax-engine', outputType: 'dist' },
  { name: '@ledger-ae/shared-types', dir: 'packages/shared-types', outputType: 'dist' },
  { name: '@ledger-ae/ubl-pinta-generator', dir: 'packages/ubl-pinta-generator', outputType: 'dist' },
  { name: '@ledger-ae/mcp-server', dir: 'packages/mcp-server', outputType: 'dist' },
  { name: '@ledger-ae/web', dir: 'apps/web', outputType: 'source' },
];

function findSourceTestFiles(dir) {
  const results = [];
  function recurse(current) {
    if (!fs.existsSync(current)) return;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist' && entry.name !== '.next') {
          recurse(full);
        }
      } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
        results.push(full);
      }
    }
  }
  recurse(dir);
  return results.sort();
}

function verifyQuotedGlobs(packageJsonPath, pkgName) {
  const content = fs.readFileSync(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(content);
  const scripts = pkg.scripts || {};

  for (const [scriptName, cmd] of Object.entries(scripts)) {
    if (scriptName.startsWith('test') && typeof cmd === 'string') {
      if (cmd.includes('*')) {
        // Must contain quotes around the glob expression
        const hasDoubleQuotes = cmd.includes('\"') || cmd.includes('"');
        const hasSingleQuotes = cmd.includes("'");
        if (!hasDoubleQuotes && !hasSingleQuotes) {
          throw new Error(
            `[FATAL] Unquoted glob detected in ${pkgName} -> scripts.${scriptName}: "${cmd}". All globs must be quoted to prevent shell glob truncation!`
          );
        }
      }
    }
  }
}

async function run() {
  console.log('='.repeat(80));
  console.log(' LedgerAE: Test Discovery & Test Completeness Verification');
  console.log('='.repeat(80));

  let totalSourceTests = 0;
  let totalExecutedTests = 0;
  let hasFailures = false;
  const resultsTable = [];

  const TEST_DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test';

  for (const pkg of PACKAGES) {
    const pkgDir = path.resolve(ROOT_DIR, pkg.dir);
    const pkgJsonPath = path.join(pkgDir, 'package.json');

    console.log(`\n▶ Inspecting workspace package: ${pkg.name} (${pkg.dir})`);

    // 1. Verify quotes on globs
    verifyQuotedGlobs(pkgJsonPath, pkg.name);

    // 2. Discover source *.test.ts files
    const srcDir = path.join(pkgDir, 'src');
    const sourceFiles = findSourceTestFiles(srcDir);
    totalSourceTests += sourceFiles.length;

    console.log(`  Source *.test.ts discovered: ${sourceFiles.length} files`);

    // 3. Execute test suite with discovery reporter
    const tempOutFile = path.join(
      os.tmpdir(),
      `test-discovery-${pkg.name.replace(/[^a-zA-Z0-9]/g, '_')}-${Date.now()}.json`
    );

    const reporterUrl = pathToFileURL(REPORTER_PATH).href;
    let testCommand;
    if (pkg.outputType === 'dist') {
      testCommand = `node --test --test-reporter="${reporterUrl}" "dist/**/*.test.js"`;
    } else {
      testCommand = `node --test --experimental-strip-types --test-reporter="${reporterUrl}" "src/**/*.test.ts"`;
    }

    try {
      execSync(testCommand, {
        cwd: pkgDir,
        env: {
          ...process.env,
          TEST_DATABASE_URL,
          DATABASE_URL: TEST_DATABASE_URL,
          TEST_DISCOVERY_OUT: tempOutFile,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      console.error(`  [ERROR] Test run failed for ${pkg.name}:`);
      if (err.stdout) console.error(err.stdout.toString());
      if (err.stderr) console.error(err.stderr.toString());
      hasFailures = true;
      continue;
    }

    // 4. Read executed files
    let executedFiles = [];
    if (fs.existsSync(tempOutFile)) {
      try {
        executedFiles = JSON.parse(fs.readFileSync(tempOutFile, 'utf-8'));
      } finally {
        fs.unlinkSync(tempOutFile);
      }
    } else {
      console.error(`  [ERROR] Discovery reporter output not found for ${pkg.name}`);
      hasFailures = true;
      continue;
    }

    totalExecutedTests += executedFiles.length;
    console.log(`  Executed test files recorded: ${executedFiles.length} files`);

    // 5. Compare source vs executed
    const normalizedExecuted = new Set(
      executedFiles.map((f) => path.normalize(f).toLowerCase())
    );

    const missingTests = [];
    for (const srcFile of sourceFiles) {
      const relToPkg = path.relative(pkgDir, srcFile);
      let expectedOutputFile;
      if (pkg.outputType === 'dist') {
        const relWithoutSrc = path.relative(path.join(pkgDir, 'src'), srcFile);
        const jsName = relWithoutSrc.replace(/\.ts$/, '.js');
        expectedOutputFile = path.join(pkgDir, 'dist', jsName);
      } else {
        expectedOutputFile = srcFile;
      }

      const normalizedExpected = path.normalize(expectedOutputFile).toLowerCase();
      if (!normalizedExecuted.has(normalizedExpected)) {
        missingTests.push({ source: relToPkg, expected: expectedOutputFile });
      }
    }

    if (sourceFiles.length !== executedFiles.length || missingTests.length > 0) {
      console.error(
        `  [FAIL] DISCOVERY MISMATCH in ${pkg.name}! Source count: ${sourceFiles.length}, Executed count: ${executedFiles.length}`
      );
      console.error('  Executed files recorded:', executedFiles);
      if (missingTests.length > 0) {
        console.error('  Missing executed tests for source files:');
        for (const m of missingTests) {
          console.error(`    - Source: ${m.source}`);
        }
      }
      hasFailures = true;
      resultsTable.push({
        Package: pkg.name,
        SourceFiles: sourceFiles.length,
        ExecutedFiles: executedFiles.length,
        Status: 'FAILED MISMATCH',
      });
    } else {
      console.log(`  ✔ Discovery MATCH: 100% of ${sourceFiles.length} test files executed.`);
      resultsTable.push({
        Package: pkg.name,
        SourceFiles: sourceFiles.length,
        ExecutedFiles: executedFiles.length,
        Status: 'VERIFIED MATCH',
      });
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(' SUMMARY: Test Discovery Across All Packages');
  console.log('='.repeat(80));
  console.table(resultsTable);
  console.log(`Total Source Test Files:   ${totalSourceTests}`);
  console.log(`Total Executed Test Files: ${totalExecutedTests}`);

  if (hasFailures || totalSourceTests !== totalExecutedTests) {
    console.error('\n❌ FATAL: Test discovery verification failed!');
    process.exit(1);
  }

  console.log('\n✅ All test files strictly discovered and executed with 0 discrepancies.');
}

run().catch((err) => {
  console.error('Fatal error during test discovery:', err);
  process.exit(1);
});
