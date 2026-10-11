import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateWpsSifFile,
  validateWpsSifContent,
  WpsHeaderRecord,
  WpsEmployeeRecord,
  calculateUaeEosg,
  EosgCalculationInput
} from './index.js';

describe('Milestone 11: UAE Payroll - Central Bank WPS SIF Validation & Article 51 EOSG Gratuity', () => {
  test('Central Bank Validation: Generates and passes valid 3-employee SIF file with 0 errors', () => {
    const header: WpsHeaderRecord = {
      employerId: '7841987654321', // 13 digits MOL Establishment Card
      payerBankRoutingCode: '033',  // Emirates NBD
      fileCreationDate: '2025-07-28',
      fileCreationTime: '1430',
      salaryYearMonth: '2025-07'
    };

    const employees: WpsEmployeeRecord[] = [
      {
        personnelId: '10012345678901', // 14 digits
        employeeIban: 'AE070331234567890123456', // 23 chars
        fixedSalaryFils: 1500000n, // AED 15,000.00
        variableSalaryFils: 300000n, // AED 3,000.00
        leaveDaysCount: 0
      },
      {
        personnelId: '10012345678902',
        employeeIban: 'AE120039876543210987654',
        fixedSalaryFils: 2200000n, // AED 22,000.00
        variableSalaryFils: 500000n, // AED 5,000.00
        leaveDaysCount: 2
      },
      {
        personnelId: '10012345678903',
        employeeIban: 'AE990215556667778889990',
        fixedSalaryFils: 850000n, // AED 8,500.00
        variableSalaryFils: 0n,
        leaveDaysCount: 0
      }
    ];

    const sifResult = generateWpsSifFile(header, employees);
    assert.equal(sifResult.fileName, '7841987654321202507281430.SIF');
    assert.equal(sifResult.totalEmployeesCount, 3);
    assert.equal(sifResult.totalSalariesFils, 5350000n); // AED 53,500.00

    // Central Bank Validation
    const validation = validateWpsSifContent(sifResult.fileContent);
    assert.equal(validation.isValid, true);
    assert.equal(validation.errors.length, 0);
    assert.equal(validation.employeeCount, 3);
    assert.equal(validation.employerId, '7841987654321');
    assert.equal(validation.routingCode, '033');
    assert.equal(validation.reconciledTotalAed, '53500.00');
  });

  test('Central Bank Validation: Detects invalid IBAN, mismatched employee counts, and incorrect totals', () => {
    // Malformed SIF string:
    // Header claims 2 employees and AED 10,000.00
    // Detail 1 has invalid IBAN (not starting with AE)
    // Detail 2 has salary discrepancy
    const invalidSif = [
      'SCR,7841987654321,033,20250728,1430,10000.00,2,AED',
      'EDR,10012345678901,033,GB29NWBK60161331926819,2025-07-01,2025-07-28,28,4000.00,1000.00,0',
      'EDR,10012345678902,033,AE120039876543210987654,2025-07-01,2025-07-28,28,3000.00,500.00,0'
      // Sum of salaries = 5000 + 3500 = 8500 != 10000
    ].join('\r\n');

    const validation = validateWpsSifContent(invalidSif);
    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.some((e) => e.includes('Invalid UAE IBAN')));
    assert.ok(validation.errors.some((e) => e.includes('Central Bank Reconciliation Error')));
  });

  test('Article 51 EOSG Gratuity: Validates 21-day tier, 30-day tier, and 2-year statutory maximum cap', () => {
    // Basic Monthly: AED 20,000 (2,000,000 fils)
    // Daily Basic Wage: 20,000 / 30 = AED 666.67 (66,667 fils)
    // Two-year statutory cap: 20,000 * 24 = AED 480,000 (48,000,000 fils)

    // Case 1: 3 years of service (21 days per year = 63 days)
    // Gratuity = 63 * 66,667 = 4,200,021 fils (approx AED 42,000)
    const res3Years = calculateUaeEosg({
      basicMonthlySalaryFils: 2000000n,
      employmentStartDate: '2022-01-01',
      employmentEndDate: '2025-01-01',
      terminationType: 'EMPLOYER_TERMINATION'
    });
    assert.equal(res3Years.completedYears, 3);
    assert.ok(res3Years.gratuityDueFils > 0n);
    assert.ok(res3Years.gratuityDueFils < res3Years.maxGratuityCapFils);

    // Case 2: 7 years of service (5 years @ 21 days = 105 days; 2 years @ 30 days = 60 days; total 165 days)
    const res7Years = calculateUaeEosg({
      basicMonthlySalaryFils: 2000000n,
      employmentStartDate: '2018-01-01',
      employmentEndDate: '2025-01-01',
      terminationType: 'RESIGNATION'
    });
    assert.equal(res7Years.completedYears, 7);
    assert.ok(res7Years.gratuityDueFils > res3Years.gratuityDueFils);

    // Case 3: 30 years of long tenure -> Hits 2-year statutory cap
    const res30Years = calculateUaeEosg({
      basicMonthlySalaryFils: 2000000n,
      employmentStartDate: '1995-01-01',
      employmentEndDate: '2025-01-01',
      terminationType: 'EMPLOYER_TERMINATION'
    });
    assert.equal(res30Years.gratuityDueFils, res30Years.maxGratuityCapFils); // Capped at exactly 48,000,000 fils
  });
});
