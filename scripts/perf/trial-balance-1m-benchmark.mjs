#!/usr/bin/env node
/**
 * ==============================================================================
 * Phase 10: 1,000,000 Ledger Lines Trial Balance Load & p95 Latency Benchmark
 * Requirement:
 *   - Ingestion/aggregation across 1,000,000 double-entry ledger lines
 *   - Calculate full Trial Balance (Debit/Credit netting per Chart of Account)
 *   - Measure p95, p99, and average execution latency
 *   - Enforce NFR Target: p95 latency < 3.0 seconds (3,000 ms)
 *   - Zero Floating-Point Drift: 100% BigInt fils minor unit verification
 * ==============================================================================
 */

import { TrialBalanceAggregator } from '../../packages/ledger-core/dist/trial-balance-aggregator.js';

console.log('================================================================');
console.log('LedgerAE Production Benchmark: 1,000,000 Ledger Lines Load Test');
console.log('Target NFR: p95 Trial Balance Query Latency < 3,000 ms');
console.log('Precision: Integer BigInt Minor Units (fils)');
console.log('================================================================\n');

const TOTAL_LINES = 1000000;
const BENCHMARK_RUNS = 10;

console.log(`[SYNTHETIC GENERATOR] Generating ${TOTAL_LINES.toLocaleString()} balanced ledger lines...`);
const genStartTime = performance.now();

const accounts = [
  { id: 'acc-1010-cash', code: '1010', name: 'Petty Cash' },
  { id: 'acc-1020-enbd', code: '1020', name: 'Emirates NBD Operating' },
  { id: 'acc-1200-ar', code: '1200', name: 'Trade Accounts Receivable' },
  { id: 'acc-1300-vat-in', code: '1300', name: 'Input VAT Recoverable' },
  { id: 'acc-2010-ap', code: '2010', name: 'Trade Accounts Payable' },
  { id: 'acc-2150-vat-out', code: '2150', name: 'Output VAT Payable' },
  { id: 'acc-3010-equity', code: '3010', name: 'Share Capital' },
  { id: 'acc-4010-rev-comm', code: '4010', name: 'Commercial Sales Revenue' },
  { id: 'acc-4020-rev-serv', code: '4020', name: 'Technical Services Revenue' },
  { id: 'acc-5010-cogs', code: '5010', name: 'Cost of Goods Sold' },
  { id: 'acc-5200-rent', code: '5200', name: 'Office Rent Expense' },
  { id: 'acc-5300-util', code: '5300', name: 'Utilities & Telecom' }
];

const lines = new Array(TOTAL_LINES);

// Generate 500,000 balanced pairs = 1,000,000 lines
for (let i = 0; i < TOTAL_LINES / 2; i++) {
  const debitAcc = accounts[i % 6];
  const creditAcc = accounts[6 + (i % 6)];
  const amountBaseFils = BigInt(10000 + ((i * 37) % 500000)); // 100.00 to 5,100.00 AED

  lines[i * 2] = {
    accountId: debitAcc.id,
    accountCode: debitAcc.code,
    accountName: debitAcc.name,
    amountBaseFils,
    direction: 'DEBIT'
  };

  lines[i * 2 + 1] = {
    accountId: creditAcc.id,
    accountCode: creditAcc.code,
    accountName: creditAcc.name,
    amountBaseFils,
    direction: 'CREDIT'
  };
}

const genDuration = performance.now() - genStartTime;
console.log(`[SYNTHETIC GENERATOR] ${TOTAL_LINES.toLocaleString()} lines generated in ${genDuration.toFixed(1)} ms.\n`);

console.log(`[BENCHMARK] Executing ${BENCHMARK_RUNS} aggregation iterations on full 1M dataset...`);
const latencies = [];
let sampleResult = null;

for (let r = 1; r <= BENCHMARK_RUNS; r++) {
  const runStart = performance.now();
  const res = TrialBalanceAggregator.aggregateLines('2026-10-31', lines);
  const runDuration = performance.now() - runStart;
  latencies.push(runDuration);
  sampleResult = res;
  process.stdout.write(`  Iteration ${r}/${BENCHMARK_RUNS}: ${runDuration.toFixed(1)} ms\n`);
}

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(BENCHMARK_RUNS * 0.5)];
const p90 = latencies[Math.floor(BENCHMARK_RUNS * 0.9)];
const p95 = latencies[Math.floor(BENCHMARK_RUNS * 0.95)] || latencies[latencies.length - 1];
const p99 = latencies[Math.floor(BENCHMARK_RUNS * 0.99)] || latencies[latencies.length - 1];
const avg = latencies.reduce((acc, v) => acc + v, 0) / latencies.length;

console.log('\n--- Latency Benchmark Telemetry Results ---');
console.log(`Dataset Size:               ${TOTAL_LINES.toLocaleString()} ledger lines`);
console.log(`Iterations:                 ${BENCHMARK_RUNS}`);
console.log(`Average Latency:            ${avg.toFixed(2)} ms`);
console.log(`p50 (Median) Latency:       ${p50.toFixed(2)} ms`);
console.log(`p90 Latency:                ${p90.toFixed(2)} ms`);
console.log(`p95 Latency:                ${p95.toFixed(2)} ms (NFR Threshold: < 3,000 ms)`);
console.log(`p99 Latency:                ${p99.toFixed(2)} ms`);

console.log('\n--- Ledger Mathematical Invariant Verification ---');
console.log(`Total Debits (Fils):        ${sampleResult.totalDebitsBaseFils.toString()}`);
console.log(`Total Credits (Fils):       ${sampleResult.totalCreditsBaseFils.toString()}`);
console.log(`Variance:                   ${(sampleResult.totalDebitsBaseFils - sampleResult.totalCreditsBaseFils).toString()} fils`);
console.log(`Is Perfectly Balanced:      ${sampleResult.isBalanced ? 'YES (100% Invariant Compliant)' : 'NO'}`);
console.log(`Aggregated COA Rows:        ${sampleResult.rows.length} accounts`);

if (p95 >= 3000.0) {
  console.error(`\n[FAIL] p95 latency (${p95.toFixed(1)} ms) exceeded 3,000 ms threshold.`);
  process.exit(1);
}

if (!sampleResult.isBalanced) {
  console.error('\n[FAIL] Trial balance failed mathematical 0-fils balance invariant.');
  process.exit(1);
}

console.log(`\n[SUCCESS] 1M lines trial balance p95 latency (${p95.toFixed(1)} ms) beat target (< 3,000 ms) by ${(3000 / p95).toFixed(1)}x!`);
process.exit(0);
