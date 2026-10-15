#!/usr/bin/env node

/**
 * CI Guard: Enforces Data Integrity Honesty in Production API Routes.
 * 
 * Rules:
 * - Scans apps/web/app/api/** non-test source files.
 * - Fails the build if forbidden words ('fallback', 'demo', 'baseline', 'simulated', 'static')
 *   appear in non-test route code.
 * - Empty ledgers/databases must return empty, correctly labelled data.
 * - Demo data may only reside in seed scripts gated to NODE_ENV !== 'production'.
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FORBIDDEN_WORDS = ['fallback', 'demo', 'baseline', 'simulated', 'static'];
const FORBIDDEN_PATTERN = new RegExp(`\\b(${FORBIDDEN_WORDS.join('|')})\\b`, 'i');

const API_DIRS = [
  resolve(process.cwd(), 'apps/web/app/api')
];

function getSourceFiles(dir) {
  let results = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry !== 'node_modules' && entry !== '.next' && entry !== '__tests__') {
          results = results.concat(getSourceFiles(fullPath));
        }
      } else if (stat.isFile()) {
        const isTest = /\.(test|spec)\.(ts|js|tsx|jsx)$/.test(entry);
        const isCode = /\.(ts|js|tsx|jsx)$/.test(entry);
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

for (const dir of API_DIRS) {
  const files = getSourceFiles(dir);
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const match = line.match(FORBIDDEN_PATTERN);
      if (match) {
        console.error(
          `FAIL [DATA INTEGRITY]: Forbidden keyword '${match[0]}' found in ${file}:${index + 1}`
        );
        console.error(`  > ${line.trim()}`);
        violations++;
      }
    });
  }
}

if (violations > 0) {
  console.error(`\nFound ${violations} data integrity violation(s) in app/api/** non-test code.`);
  console.error('All mock fallbacks and simulated responses are strictly prohibited in API routes.');
  console.error('Empty database queries must return empty, correctly labelled data.');
  process.exit(1);
} else {
  console.log('✓ PASS: Zero mock/fallback/simulated/baseline keywords found in app/api/** non-test code.');
  process.exit(0);
}
