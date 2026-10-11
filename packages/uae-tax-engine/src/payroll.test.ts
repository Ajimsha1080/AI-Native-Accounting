import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateUaeEosg, EosgCalculationInput } from './eosg.js';
import { generateWpsSifFile, WpsHeaderRecord, WpsEmployeeRecord } from './wps-sif.js';

describe('UAE Payroll: End of Service Gratuity (Federal Decree-Law No. 33 of 2021)', () => {
  test('Tenure less than 1 year yields zero gratuity', () => {
    const input: EosgCalculationInput = {
      basicMonthlySalaryFils: 1000000n, // AED 10,000 basic
      employmentStartDate: '2025-06-01',
      employmentEndDate: '2025-11-30', // 6 months
      terminationType: 'RESIGNATION'
    };
    const res = calculateUaeEosg(input);
    assert.equal(res.gratuityDueFils, 0n);
    assert.match(res.legalCitation, /Article 51\(2\)/);
  });

  test('Tenure between 1 and 5 years calculates 21 days per year', () => {
    // 3 complete years @ AED 15,000 basic (1,500,000 fils)
    // Daily wage = 15,000 / 30 = AED 500 (50,000 fils)
    // Gratuity days = 3 * 21 = 63 days
    // Total Gratuity = 63 * 500 = AED 31,500.00 (3,150,000 fils)
    const input: EosgCalculationInput = {
      basicMonthlySalaryFils: 1500000n,
      employmentStartDate: '2022-01-01',
      employmentEndDate: '2025-01-01', // exactly 3 years (1096 days)
      terminationType: 'EMPLOYER_TERMINATION'
    };
    const res = calculateUaeEosg(input);
    assert.equal(res.completedYears, 3);
    assert.equal(res.dailyWageFils, 50000n);
    assert.equal(res.gratuityDueFils, 3150000n); // AED 31,500.00
  });

  test('Tenure exceeding 5 years calculates 21 days for first 5 years and 30 days thereafter', () => {
    // 7 complete years @ AED 12,000 basic (1,200,000 fils)
    // Daily wage = 12,000 / 30 = AED 400 (40,000 fils)
    // First 5 years = 5 * 21 = 105 days
    // Next 2 years = 2 * 30 = 60 days
    // Total days = 165 days
    // Total Gratuity = 165 * 400 = AED 66,000.00 (6,600,000 fils)
    const input: EosgCalculationInput = {
      basicMonthlySalaryFils: 1200000n,
      employmentStartDate: '2018-01-01',
      employmentEndDate: '2025-01-01', // 7 years
      terminationType: 'EMPLOYER_TERMINATION'
    };
    const res = calculateUaeEosg(input);
    assert.equal(res.completedYears, 7);
    assert.equal(res.dailyWageFils, 40000n);
    assert.equal(res.gratuityDueFils, 6600000n); // AED 66,000.00
  });
});

describe('UAE Payroll: Wages Protection System (WPS) SIF Generation', () => {
  test('Generates valid SIF file with SCR header and EDR records', () => {
    const header: WpsHeaderRecord = {
      employerId: '1234567890123',
      payerBankRoutingCode: '033', // Emirates NBD
      fileCreationDate: '2026-02-28',
      fileCreationTime: '1430',
      salaryYearMonth: '2026-02'
    };

    const employees: WpsEmployeeRecord[] = [
      {
        personnelId: '78419851234567',
        employeeIban: 'AE070331234567890123456',
        fixedSalaryFils: 800000n, // AED 8,000.00
        variableSalaryFils: 200000n, // AED 2,000.00
        leaveDaysCount: 0
      },
      {
        personnelId: '78419909876543',
        employeeIban: 'AE250339876543210987654',
        fixedSalaryFils: 1500000n, // AED 15,000.00
        variableSalaryFils: 500000n, // AED 5,000.00
        leaveDaysCount: 2
      }
    ];

    const result = generateWpsSifFile(header, employees);

    assert.equal(result.totalEmployeesCount, 2);
    // Total Salary = (8k + 2k) + (15k + 5k) = 30,000.00 AED (3,000,000 fils)
    assert.equal(result.totalSalariesFils, 3000000n);
    assert.equal(result.formattedTotalAed, '30000.00');

    // Header check
    assert.match(result.fileContent, /^SCR,1234567890123,033,20260228,1430,30000\.00,2,AED/);

    // EDR line check
    assert.match(result.fileContent, /EDR,78419851234567,033,AE070331234567890123456,2026-02-01,2026-02-28,28,8000\.00,2000\.00,0/);
    assert.match(result.fileName, /1234567890123202602281430\.SIF/);
  });
});
