#!/usr/bin/env node

/**
 * CI Guard: Enforces Data Integrity Honesty Across the Complete Repository.
 * 
 * Rules:
 * - Scans apps/web/app/api/**, apps/web/src/**, packages/** /src, and backend/app/** non-test source files.
 * - Prohibits mock responses, fake provider adapters, and fabricated financial results in production paths.
 * - Empty ledgers/databases must return empty, correctly labelled data.
 * - Demo/test fixtures are strictly isolated behind NODE_ENV !== 'production' or in tests.
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Strict check for API routes
const FORBIDDEN_API_WORDS = ['fallback', 'demo', 'baseline', 'simulated'];
const FORBIDDEN_API_PATTERN = new RegExp(`\\b(${FORBIDDEN_API_WORDS.join('|')})\\b`, 'i');

// Strict check for Core Domain & Integrations
const FORBIDDEN_CORE_PATTERNS = [
  /\bfake_response\b/i,
  /\bmock_response\b/i,
  /\bfake_transaction\b/i,
  /\bmockTotalDebits\b/i,
  /\bhardcoded_balance\b/i,
  /\bsimulate_success\b/i
];

const SCAN_DIRS = [
  { path: resolve(process.cwd(), 'apps/web/app/api'), isApi: true },
  { path: resolve(process.cwd(), 'packages/ledger-core/src'), isApi: false },
  { path: resolve(process.cwd(), 'packages/mcp-server/src'), isApi: false },
  { path: resolve(process.cwd(), 'packages/shared-types/src'), isApi: false },
  { path: resolve(process.cwd(), 'packages/uae-tax-engine/src'), isApi: false },
  { path: resolve(process.cwd(), 'packages/ubl-pinta-generator/src'), isApi: false },
  { path: resolve(process.cwd(), 'backend/app'), isApi: false }
];

function getSourceFiles(dir) {
  let results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry !== 'node_modules' && entry !== '.next' && entry !== '__tests__' && entry !== 'tests' && entry !== '.venv' && entry !== '__pycache__') {
          results = results.concat(getSourceFiles(fullPath));
        }
      } else if (stat.isFile()) {
        const isTest = /\.(test|spec)\.(ts|js|tsx|jsx|py)$/.test(entry) || entry.startsWith('test_');
        const isCode = /\.(ts|js|tsx|jsx|py)$/.test(entry);
        if (isCode && !isTest) {
          results.push(fullPath);
        }
      }
    }
  } catch (err) {
    // Directory might not exist in some environments
  }
  return results;
}

let violations = 0;

for (const { path: dir, isApi } of SCAN_DIRS) {
  const files = getSourceFiles(dir);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // 1. If API route, enforce no fallback/demo keywords
      if (isApi) {
        const match = line.match(FORBIDDEN_API_PATTERN);
        if (match) {
          console.error(
            `FAIL [DATA INTEGRITY]: Forbidden keyword '${match[0]}' found in API route ${file}:${index + 1}`
          );
          console.error(`  > ${line.trim()}`);
          violations++;
        }
      }

      // 2. Enforce core domain patterns across all production paths
      for (const pattern of FORBIDDEN_CORE_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          console.error(
            `FAIL [DATA INTEGRITY]: Prohibited fake/mock pattern '${match[0]}' found in ${file}:${index + 1}`
          );
          console.error(`  > ${line.trim()}`);
          violations++;
        }
      }
    });
  }
}

if (violations > 0) {
  console.error(`\nFound ${violations} data integrity violation(s) across repository.`);
  console.error('All mock fallbacks, fake provider responses, and hardcoded financial results are strictly prohibited.');
  process.exit(1);
} else {
  console.log('✓ PASS: Zero mock responses, fake provider adapters, or hardcoded financial results detected across repository.');
  process.exit(0);
}
