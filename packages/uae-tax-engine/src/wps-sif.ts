import { parseDecimalToMinorUnits, formatMinorUnitsToDecimal } from '@ledger-ae/shared-types';

export interface WpsEmployeeRecord {
  personnelId: string;       // 14-digit Labour Card / Employee ID
  employeeIban: string;      // 23-character UAE IBAN starting with 'AE'
  fixedSalaryFils: bigint;   // Basic wage
  variableSalaryFils: bigint;// Allowances / overtime
  leaveDaysCount: number;
}

export interface WpsHeaderRecord {
  employerId: string;        // 13-digit MOL Employer ID / Establishment Number
  payerBankRoutingCode: string; // Central Bank routing code e.g. '033' for ENBD, '003' for FAB
  fileCreationDate: string;  // 'YYYY-MM-DD'
  fileCreationTime: string;  // 'HHMM'
  salaryYearMonth: string;   // 'YYYY-MM'
}

export interface WpsSifFileResult {
  fileName: string;
  fileContent: string;
  totalEmployeesCount: number;
  totalSalariesFils: bigint;
  formattedTotalAed: string;
}

/**
 * Generates official Salary Information File (SIF) format for the UAE Wages Protection System (WPS).
 * Formatted according to UAE Central Bank and Ministry of Human Resources and Emiratisation (MOHRE) standards.
 */
export function generateWpsSifFile(
  header: WpsHeaderRecord,
  employees: WpsEmployeeRecord[]
): WpsSifFileResult {
  let totalSalariesFils = 0n;
  const lines: string[] = [];

  // Detail lines: EDR (Employee Detail Record)
  // Format: EDR,PersonnelID,RoutingCode,IBAN,StartDate,EndDate,Days,FixedSalary,VariableSalary,LeaveDays
  for (const emp of employees) {
    const salaryThisEmp = emp.fixedSalaryFils + emp.variableSalaryFils;
    totalSalariesFils += salaryThisEmp;

    const fixedAed = formatMinorUnitsToDecimal(emp.fixedSalaryFils);
    const variableAed = formatMinorUnitsToDecimal(emp.variableSalaryFils);

    lines.push(
      `EDR,${emp.personnelId},${header.payerBankRoutingCode},${emp.employeeIban},${header.salaryYearMonth}-01,${header.salaryYearMonth}-28,28,${fixedAed},${variableAed},${emp.leaveDaysCount}`
    );
  }

  // Header line: SCR (Salary Control Record)
  // Format: SCR,EmployerID,RoutingCode,FileCreationDate,FileCreationTime,TotalSalary,Count,AED
  const totalSalariesAed = formatMinorUnitsToDecimal(totalSalariesFils);
  const cleanDate = header.fileCreationDate.replace(/-/g, '');
  const headerLine = `SCR,${header.employerId},${header.payerBankRoutingCode},${cleanDate},${header.fileCreationTime},${totalSalariesAed},${employees.length},AED`;

  const fileContent = [headerLine, ...lines].join('\r\n');
  const fileName = `${header.employerId}${cleanDate}${header.fileCreationTime}.SIF`;

  return {
    fileName,
    fileContent,
    totalEmployeesCount: employees.length,
    totalSalariesFils,
    formattedTotalAed: totalSalariesAed
  };
}

export interface WpsValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  reconciledTotalAed: string;
  employeeCount: number;
  employerId: string;
  routingCode: string;
}

/**
 * Validates a generated SIF file against UAE Central Bank and MOHRE statutory rules.
 */
export function validateWpsSifContent(sifContent: string): WpsValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = sifContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return {
      isValid: false,
      errors: ['SIF file is completely empty.'],
      warnings: [],
      reconciledTotalAed: '0.00',
      employeeCount: 0,
      employerId: '',
      routingCode: ''
    };
  }

  // 1. Validate Header (SCR)
  const headerLine = lines[0];
  const headerParts = headerLine.split(',');

  if (headerParts[0] !== 'SCR') {
    errors.push(`First line must be Salary Control Record (SCR). Found: ${headerParts[0]}`);
  }

  if (headerParts.length !== 8) {
    errors.push(`SCR header must have exactly 8 comma-separated fields. Found: ${headerParts.length}`);
  }

  const employerId = headerParts[1] ?? '';
  if (!/^\d{13}$/.test(employerId)) {
    errors.push(`Employer ID must be exactly 13 numeric digits. Found: "${employerId}"`);
  }

  const routingCode = headerParts[2] ?? '';
  if (!/^\d{3}$/.test(routingCode)) {
    errors.push(`Payer Bank Routing Code must be exactly 3 numeric digits. Found: "${routingCode}"`);
  }

  const fileDate = headerParts[3] ?? '';
  if (!/^\d{8}$/.test(fileDate)) {
    errors.push(`File creation date must be YYYYMMDD format. Found: "${fileDate}"`);
  }

  const fileTime = headerParts[4] ?? '';
  if (!/^\d{4}$/.test(fileTime)) {
    errors.push(`File creation time must be HHMM format. Found: "${fileTime}"`);
  }

  const headerTotalFils = parseDecimalToMinorUnits(headerParts[5] ?? '0');
  const headerCount = parseInt(headerParts[6] ?? '0', 10);
  const currency = headerParts[7] ?? '';

  if (currency !== 'AED') {
    errors.push(`Currency must be strictly 'AED'. Found: "${currency}"`);
  }

  // 2. Validate Detail lines (EDR)
  const edrLines = lines.slice(1);
  if (edrLines.length !== headerCount) {
    errors.push(`Header employee count (${headerCount}) does not match detail line count (${edrLines.length}).`);
  }

  let totalEdrSalaryFils = 0n;

  for (let i = 0; i < edrLines.length; i++) {
    const lineIndex = i + 2;
    const parts = edrLines[i].split(',');

    if (parts[0] !== 'EDR') {
      errors.push(`Line ${lineIndex}: Must start with 'EDR'. Found: "${parts[0]}"`);
      continue;
    }

    if (parts.length !== 10) {
      errors.push(`Line ${lineIndex}: EDR record must have exactly 10 fields. Found: ${parts.length}`);
      continue;
    }

    const personnelId = parts[1];
    if (!/^\d{14}$/.test(personnelId)) {
      errors.push(`Line ${lineIndex}: Personnel ID / Labour Card must be 14 numeric digits. Found: "${personnelId}"`);
    }

    const iban = parts[3];
    // UAE IBAN format: 23 characters starting with 'AE' followed by 21 alphanumeric
    if (!/^AE\d{2}[A-Z0-9]{19}$/i.test(iban)) {
      errors.push(`Line ${lineIndex}: Invalid UAE IBAN format "${iban}". Must be 23 characters starting with 'AE'.`);
    }

    let fixedFils = 0n;
    let varFils = 0n;
    try {
      fixedFils = parseDecimalToMinorUnits(parts[7] ?? '0', { allowNegative: false });
    } catch {
      errors.push(`Line ${lineIndex}: Invalid fixed salary "${parts[7]}"`);
    }
    try {
      varFils = parseDecimalToMinorUnits(parts[8] ?? '0', { allowNegative: false });
    } catch {
      errors.push(`Line ${lineIndex}: Invalid variable salary "${parts[8]}"`);
    }

    totalEdrSalaryFils += fixedFils + varFils;
  }

  // 3. Reconcile Totals
  if (totalEdrSalaryFils !== headerTotalFils) {
    errors.push(
      `Central Bank Reconciliation Error: Header total AED (${formatMinorUnitsToDecimal(headerTotalFils)}) differs from sum of EDR detail records (${formatMinorUnitsToDecimal(totalEdrSalaryFils)}).`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    reconciledTotalAed: formatMinorUnitsToDecimal(totalEdrSalaryFils),
    employeeCount: edrLines.length,
    employerId,
    routingCode
  };
}
