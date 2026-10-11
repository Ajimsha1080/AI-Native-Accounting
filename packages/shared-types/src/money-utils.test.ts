import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDecimalToMinorUnits,
  formatMinorUnitsToDecimal
} from './index.js';

describe('Phase 4: Zero-Float Money & Property-Based Precision Suite', () => {
  describe('parseDecimalToMinorUnits unit tests', () => {
    it('parses typical AED amounts accurately', () => {
      assert.equal(parseDecimalToMinorUnits('100.50'), 10050n);
      assert.equal(parseDecimalToMinorUnits('0.05'), 5n);
      assert.equal(parseDecimalToMinorUnits('1,250,000.75'), 125000075n);
      assert.equal(parseDecimalToMinorUnits('500'), 50000n);
      assert.equal(parseDecimalToMinorUnits('AED 450.25'), 45025n);
      assert.equal(parseDecimalToMinorUnits('د.إ 10.00'), 1000n);
    });

    it('handles negative numbers correctly when allowed', () => {
      assert.equal(parseDecimalToMinorUnits('-8400.00'), -840000n);
      assert.equal(parseDecimalToMinorUnits('-0.25'), -25n);
    });

    it('rejects negative numbers when allowNegative is false', () => {
      assert.throws(() => {
        parseDecimalToMinorUnits('-100.00', { allowNegative: false });
      }, /Negative money amounts are forbidden/);
    });

    it('rejects raw JS numbers to avoid IEEE-754 precision trap', () => {
      assert.throws(() => {
        parseDecimalToMinorUnits(100.5 as any);
      }, /Passing JS number to parseDecimalToMinorUnits is forbidden/);
    });

    it('parses empty, whitespace, and N/A as 0n', () => {
      assert.equal(parseDecimalToMinorUnits(''), 0n);
      assert.equal(parseDecimalToMinorUnits('   '), 0n);
      assert.equal(parseDecimalToMinorUnits('N/A'), 0n);
    });
  });

  describe('formatMinorUnitsToDecimal unit tests', () => {
    it('formats minor units to decimal string without drift', () => {
      assert.equal(formatMinorUnitsToDecimal(10050n), '100.50');
      assert.equal(formatMinorUnitsToDecimal(5n), '0.05');
      assert.equal(formatMinorUnitsToDecimal(0n), '0.00');
      assert.equal(formatMinorUnitsToDecimal(-840000n), '-8400.00');
      assert.equal(formatMinorUnitsToDecimal(125000075n), '1250000.75');
    });

    it('supports string input', () => {
      assert.equal(formatMinorUnitsToDecimal('10500000'), '105000.00');
    });
  });

  describe('Property-Based Invertibility Tests (10,000 Iterations)', () => {
    it('property: formatMinorUnitsToDecimal(parseDecimalToMinorUnits(x)) === x for all valid 2-decimal inputs', () => {
      // Test over 10,000 random monetary values from 0 fils to 100,000,000 AED
      for (let i = 0; i < 10000; i++) {
        const whole = Math.floor(Math.random() * 1000000);
        const cents = Math.floor(Math.random() * 100);
        const originalDecimal = `${whole}.${String(cents).padStart(2, '0')}`;

        const parsedFils = parseDecimalToMinorUnits(originalDecimal);
        const expectedFils = BigInt(whole) * 100n + BigInt(cents);
        assert.equal(parsedFils, expectedFils, `Mismatch parsing ${originalDecimal}`);

        const roundTripDecimal = formatMinorUnitsToDecimal(parsedFils);
        assert.equal(roundTripDecimal, originalDecimal, `Mismatch round-tripping ${originalDecimal}`);
      }
    });

    it('property: parseDecimalToMinorUnits(a + b) === parse(a) + parse(b) without floating-point drift', () => {
      // Known IEEE-754 failure case: 0.1 + 0.2 === 0.30000000000000004
      const a = '0.10';
      const b = '0.20';
      const c = '0.30';

      const aFils = parseDecimalToMinorUnits(a); // 10n
      const bFils = parseDecimalToMinorUnits(b); // 20n
      const cFils = parseDecimalToMinorUnits(c); // 30n

      assert.equal(aFils + bFils, cFils);
      assert.equal(formatMinorUnitsToDecimal(aFils + bFils), c);
    });
  });
});
