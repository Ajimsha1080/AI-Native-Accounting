#!/usr/bin/env node
/**
 * Zero-Float Money Linter for LedgerAE
 * Enforces the strict financial invariant:
 * "integer minor units everywhere; no parseFloat/Number/toFixed on money."
 *
 * Scans all TypeScript and TSX source files in packages/ and apps/
 * to ban floating-point parsing or operations on money variables.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const FORBIDDEN_MONEY_PATTERNS = [
  {
    regex: /parseFloat\s*\(/g,
    name: 'parseFloat() on money',
    reason: 'IEEE-754 floating point precision loss. Use parseDecimalToMinorUnits() from @ledger-ae/shared-types instead.'
  },
  {
    regex: /Number\s*\(\s*[a-zA-Z0-9_.]*(?:fils|minor|amount|price|salary|total|subtotal|balance|debit|credit)[a-zA-Z0-9_.]*\s*\)\s*\/\s*100/gi,
    name: 'Number(money) / 100 float conversion',
    reason: 'Converting integer minor units to float. Use formatMinorUnitsToDecimal() or formatMoney() instead.'
  },
  {
    regex: /\.\s*toFixed\s*\(\s*\d+\s*\)/g,
    name: '.toFixed() on numeric money',
    reason: 'Number.toFixed() suffers from IEEE-754 representation issues. Use formatMinorUnitsToDecimal() instead.',
    filter: (line) => !line.includes('Ratio') && !line.includes('Rate') && !line.includes('percentage') // Allow non-money percentage/ratio displays
  }
];

function scanDirectory(dir, violations) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (['node_modules', 'dist', '.next', '.git', 'coverage'].includes(entry)) {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      scanDirectory(fullPath, violations);
    } else if (stat.isFile() && ['.ts', '.tsx'].includes(extname(fullPath))) {
      // Skip test files from strict linter if they test error cases or property generators
      if (entry.includes('.test.') || entry.includes('.spec.')) {
        continue;
      }
      checkFile(fullPath, violations);
    }
  }
}

function checkFile(filePath, violations) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, index) => {
    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      return;
    }

    for (const rule of FORBIDDEN_MONEY_PATTERNS) {
      if (rule.filter && !rule.filter(line)) {
        continue;
      }
      const matches = line.match(rule.regex);
      if (matches) {
        violations.push({
          file: filePath,
          line: index + 1,
          code: line.trim(),
          rule: rule.name,
          reason: rule.reason
        });
      }
    }
  });
}

function main() {
  console.log('🔍 Running LedgerAE Zero-Float Money Linter...');
  const violations = [];

  const targets = ['packages', 'apps'];
  for (const target of targets) {
    try {
      scanDirectory(target, violations);
    } catch (err) {
      // directory might not exist
    }
  }

  if (violations.length > 0) {
    console.error(`\n❌ Found ${violations.length} zero-float money violation(s):`);
    violations.forEach((v) => {
      console.error(`  ${v.file}:${v.line}`);
      console.error(`    Violation: ${v.rule}`);
      console.error(`    Code: "${v.code}"`);
      console.error(`    Remedy: ${v.reason}\n`);
    });
    process.exit(1);
  }

  console.log('✅ Zero-Float Money check passed: No parseFloat, float money division, or money toFixed detected.');
  process.exit(0);
}

main();
