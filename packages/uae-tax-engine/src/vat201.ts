import { getTaxRuleByCode, TaxRuleDefinition } from './rules.js';

export enum UaeEmirate {
  ABU_DHABI = 'ABU_DHABI',
  DUBAI = 'DUBAI',
  SHARJAH = 'SHARJAH',
  AJMAN = 'AJMAN',
  UMM_AL_QUWAIN = 'UMM_AL_QUWAIN',
  RAS_AL_KHAIMAH = 'RAS_AL_KHAIMAH',
  FUJAIRAH = 'FUJAIRAH'
}

export interface VatLineInput {
  lineId?: string;
  voucherId?: string;
  documentNumber?: string;
  transactionDate?: string;
  counterpartyName?: string;
  counterpartyTrn?: string;
  taxCode: string;
  emirate?: UaeEmirate;
  netAmountBase: bigint; // minor units (fils)
  vatAmountBase?: bigint; // optional precomputed
  adjustmentAmountBase?: bigint; // credit notes, bad debt relief
  isRecoverable?: boolean;
  description?: string;
}

export interface VatDrillDownRecord {
  recordId: string;
  voucherId: string;
  documentNumber: string;
  transactionDate: string;
  counterpartyName: string;
  counterpartyTrn?: string;
  taxCode: string;
  emirate?: UaeEmirate;
  netAmountBase: bigint; // fils
  vatAmountBase: bigint; // fils
  adjustmentAmountBase: bigint; // fils
  isRecoverable: boolean;
  description: string;
  lawReference: string;
}

export interface Vat201BoxSummary {
  boxId: string; // e.g. "1", "1a", "1b", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"
  boxNumber: number;
  boxTitleEn: string;
  boxTitleAr: string;
  amountBase: bigint;
  vatAmountBase: bigint;
  adjustmentAmountBase: bigint;
  lineCount: number;
  drillDownRecords: VatDrillDownRecord[];
}

export interface Vat201ReturnCalculation {
  taxPeriod: string;
  taxRegistrationNumber: string;
  boxes: Vat201BoxSummary[];
  emirateBreakdown: Record<UaeEmirate, Vat201BoxSummary>;
  totalOutputTax: bigint;
  totalInputTax: bigint;
  netTaxPayableOrReclaimable: bigint;
  advisorVerificationRequired: boolean;
  warnings: string[];
  generatedAt: string;
}

const EMIRATE_CONFIG: Record<
  UaeEmirate,
  { boxId: string; titleEn: string; titleAr: string; codeSuffix: string }
> = {
  [UaeEmirate.ABU_DHABI]: {
    boxId: '1a',
    titleEn: 'Standard rated supplies in Abu Dhabi',
    titleAr: 'التوريدات الخاضعة للنسبة الأساسية في أبوظبي',
    codeSuffix: 'AUH'
  },
  [UaeEmirate.DUBAI]: {
    boxId: '1b',
    titleEn: 'Standard rated supplies in Dubai',
    titleAr: 'التوريدات الخاضعة للنسبة الأساسية في دبي',
    codeSuffix: 'DXB'
  },
  [UaeEmirate.SHARJAH]: {
    boxId: '1c',
    titleEn: 'Standard rated supplies in Sharjah',
    titleAr: 'التوريدات الخاضعة للنسبة الأساسية في الشارقة',
    codeSuffix: 'SHJ'
  },
  [UaeEmirate.AJMAN]: {
    boxId: '1d',
    titleEn: 'Standard rated supplies in Ajman',
    titleAr: 'التوريدات الخاضعة للنسبة الأساسية في عجمان',
    codeSuffix: 'AJM'
  },
  [UaeEmirate.UMM_AL_QUWAIN]: {
    boxId: '1e',
    titleEn: 'Standard rated supplies in Umm Al Quwain',
    titleAr: 'التوريدات الخاضعة للنسبة الأساسية في أم القيوين',
    codeSuffix: 'UAQ'
  },
  [UaeEmirate.RAS_AL_KHAIMAH]: {
    boxId: '1f',
    titleEn: 'Standard rated supplies in Ras Al Khaimah',
    titleAr: 'التوريدات الخاضعة للنسبة الأساسية في رأس الخيمة',
    codeSuffix: 'RAK'
  },
  [UaeEmirate.FUJAIRAH]: {
    boxId: '1g',
    titleEn: 'Standard rated supplies in Fujairah',
    titleAr: 'التوريدات الخاضعة للنسبة الأساسية في الفجيرة',
    codeSuffix: 'FUJ'
  }
};

/**
 * Calculates official FTA VAT 201 Return with Emirate breakdown (Box 1a-1g)
 * and point-in-time drill-down source records.
 */
export function calculateVat201Return(
  trn: string,
  period: string,
  lines: VatLineInput[]
): Vat201ReturnCalculation {
  const warnings: string[] = [];
  let advisorVerificationRequired = false;

  // Trackers per Emirate
  const emirateData: Record<
    UaeEmirate,
    { net: bigint; vat: bigint; adj: bigint; lines: VatDrillDownRecord[] }
  > = {
    [UaeEmirate.ABU_DHABI]: { net: 0n, vat: 0n, adj: 0n, lines: [] },
    [UaeEmirate.DUBAI]: { net: 0n, vat: 0n, adj: 0n, lines: [] },
    [UaeEmirate.SHARJAH]: { net: 0n, vat: 0n, adj: 0n, lines: [] },
    [UaeEmirate.AJMAN]: { net: 0n, vat: 0n, adj: 0n, lines: [] },
    [UaeEmirate.UMM_AL_QUWAIN]: { net: 0n, vat: 0n, adj: 0n, lines: [] },
    [UaeEmirate.RAS_AL_KHAIMAH]: { net: 0n, vat: 0n, adj: 0n, lines: [] },
    [UaeEmirate.FUJAIRAH]: { net: 0n, vat: 0n, adj: 0n, lines: [] }
  };

  // Other Box Trackers
  const box2Records: VatDrillDownRecord[] = [];
  const box3Records: VatDrillDownRecord[] = [];
  const box4Records: VatDrillDownRecord[] = [];
  const box5Records: VatDrillDownRecord[] = [];
  const box6Records: VatDrillDownRecord[] = [];
  const box7Records: VatDrillDownRecord[] = [];
  const box9Records: VatDrillDownRecord[] = [];
  const box10Records: VatDrillDownRecord[] = [];

  let lineCounter = 0;

  for (const line of lines) {
    lineCounter++;
    const rule = getTaxRuleByCode(line.taxCode);
    if (!rule) {
      warnings.push(`Unknown tax code detected: ${line.taxCode}`);
      continue;
    }

    if (rule.verifyWithTaxAdvisor) {
      advisorVerificationRequired = true;
    }

    const rateBps = BigInt(rule.rateBps);
    const lineVat =
      line.vatAmountBase !== undefined
        ? line.vatAmountBase
        : (line.netAmountBase * rateBps) / 10000n;
    const lineAdj = line.adjustmentAmountBase ?? 0n;

    const drillRecord: VatDrillDownRecord = {
      recordId: line.lineId ?? `ln_${lineCounter}`,
      voucherId: line.voucherId ?? `vch_${lineCounter}`,
      documentNumber: line.documentNumber ?? `DOC-${lineCounter}`,
      transactionDate: line.transactionDate ?? new Date().toISOString().slice(0, 10),
      counterpartyName: line.counterpartyName ?? 'Counterparty',
      counterpartyTrn: line.counterpartyTrn,
      taxCode: line.taxCode,
      emirate: line.emirate,
      netAmountBase: line.netAmountBase,
      vatAmountBase: lineVat,
      adjustmentAmountBase: lineAdj,
      isRecoverable: line.isRecoverable !== false,
      description: line.description ?? rule.descriptionEn,
      lawReference: rule.lawReference
    };

    // Routing by Tax Code and Box Mapping
    if (line.taxCode.startsWith('SR_5')) {
      // Determine Emirate: explicit emirate takes priority, or from tax code suffix, default to DUBAI
      let targetEmirate = line.emirate ?? UaeEmirate.DUBAI;
      for (const [em, conf] of Object.entries(EMIRATE_CONFIG)) {
        if (line.taxCode.endsWith(conf.codeSuffix)) {
          targetEmirate = em as UaeEmirate;
          break;
        }
      }
      drillRecord.emirate = targetEmirate;
      emirateData[targetEmirate].net += line.netAmountBase;
      emirateData[targetEmirate].vat += lineVat;
      emirateData[targetEmirate].adj += lineAdj;
      emirateData[targetEmirate].lines.push(drillRecord);
    } else if (line.taxCode === 'TOURIST_REFUND') {
      box2Records.push(drillRecord);
    } else if (line.taxCode === 'RCM_5') {
      // Box 3: Reverse charge supplies (Output Tax)
      box3Records.push(drillRecord);

      // Box 10: Input tax recovery under RCM if recoverable
      if (line.isRecoverable !== false) {
        const inputRecord: VatDrillDownRecord = {
          ...drillRecord,
          recordId: `${drillRecord.recordId}_rcm_inp`,
          description: `RCM Input Recovery: ${drillRecord.description}`
        };
        box10Records.push(inputRecord);
      }
    } else if (line.taxCode.startsWith('ZR_')) {
      box4Records.push(drillRecord);
    } else if (line.taxCode.startsWith('EX_')) {
      box5Records.push(drillRecord);
    } else if (line.taxCode === 'CUSTOMS_IMPORT_5') {
      box6Records.push(drillRecord);
    } else if (line.taxCode === 'CUSTOMS_ADJ') {
      box7Records.push(drillRecord);
    } else if (line.taxCode === 'INPUT_SR_5' || line.taxCode === 'INPUT_BLOCKED_5') {
      if (line.isRecoverable !== false && line.taxCode !== 'INPUT_BLOCKED_5') {
        box9Records.push(drillRecord);
      } else {
        // Blocked input VAT per Article 53
        advisorVerificationRequired = true;
        const blockedRecord: VatDrillDownRecord = {
          ...drillRecord,
          vatAmountBase: 0n, // Zero recoverable
          description: `Non-recoverable input tax: ${drillRecord.description}`
        };
        box9Records.push(blockedRecord);
      }
    }
  }

  // Aggregate Emirate Boxes 1a to 1g
  const emirateBreakdown = {} as Record<UaeEmirate, Vat201BoxSummary>;
  let totalBox1Net = 0n;
  let totalBox1Vat = 0n;
  let totalBox1Adj = 0n;
  const allBox1Records: VatDrillDownRecord[] = [];

  for (const [emKey, conf] of Object.entries(EMIRATE_CONFIG)) {
    const em = emKey as UaeEmirate;
    const data = emirateData[em];
    totalBox1Net += data.net;
    totalBox1Vat += data.vat;
    totalBox1Adj += data.adj;
    allBox1Records.push(...data.lines);

    emirateBreakdown[em] = {
      boxId: conf.boxId,
      boxNumber: 1,
      boxTitleEn: conf.titleEn,
      boxTitleAr: conf.titleAr,
      amountBase: data.net,
      vatAmountBase: data.vat,
      adjustmentAmountBase: data.adj,
      lineCount: data.lines.length,
      drillDownRecords: data.lines
    };
  }

  // Construct Box 1 Aggregate
  const box1Summary: Vat201BoxSummary = {
    boxId: '1',
    boxNumber: 1,
    boxTitleEn: 'Standard rated supplies in UAE',
    boxTitleAr: 'التوريدات الخاضعة للنسبة الأساسية في الدولة',
    amountBase: totalBox1Net,
    vatAmountBase: totalBox1Vat,
    adjustmentAmountBase: totalBox1Adj,
    lineCount: allBox1Records.length,
    drillDownRecords: allBox1Records
  };

  // Helper to construct box summary from records
  const buildBox = (
    boxId: string,
    boxNumber: number,
    titleEn: string,
    titleAr: string,
    records: VatDrillDownRecord[]
  ): Vat201BoxSummary => {
    let amt = 0n;
    let vat = 0n;
    let adj = 0n;
    for (const r of records) {
      amt += r.netAmountBase;
      vat += r.vatAmountBase;
      adj += r.adjustmentAmountBase;
    }
    return {
      boxId,
      boxNumber,
      boxTitleEn: titleEn,
      boxTitleAr: titleAr,
      amountBase: amt,
      vatAmountBase: vat,
      adjustmentAmountBase: adj,
      lineCount: records.length,
      drillDownRecords: records
    };
  };

  const box2 = buildBox(
    '2',
    2,
    'Tax Invoices Issued to Tourists',
    'الفواتير الضريبية المصدرة للسياح',
    box2Records
  );
  const box3 = buildBox(
    '3',
    3,
    'Supplies subject to reverse charge provisions',
    'التوريدات الخاضعة لآلية الاحتساب العكسي',
    box3Records
  );
  const box4 = buildBox(
    '4',
    4,
    'Zero rated supplies',
    'التوريدات الخاضعة لنسبة الصفر',
    box4Records
  );
  const box5 = buildBox(
    '5',
    5,
    'Exempt supplies',
    'التوريدات المعفاة من الضريبة',
    box5Records
  );
  const box6 = buildBox(
    '6',
    6,
    'Goods imported into UAE',
    'السلع المستوردة إلى الدولة',
    box6Records
  );
  const box7 = buildBox(
    '7',
    7,
    'Adjustments to goods imported into UAE',
    'تعديلات على السلع المستوردة إلى الدولة',
    box7Records
  );

  // Box 8: Total Output Tax
  const totalOutputVat =
    box1Summary.vatAmountBase +
    box2.vatAmountBase +
    box3.vatAmountBase +
    box6.vatAmountBase +
    box7.vatAmountBase;
  const totalOutputNet =
    box1Summary.amountBase +
    box2.amountBase +
    box3.amountBase +
    box4.amountBase +
    box5.amountBase +
    box6.amountBase +
    box7.amountBase;

  const box8: Vat201BoxSummary = {
    boxId: '8',
    boxNumber: 8,
    boxTitleEn: 'Total value of due tax for the period (Output Tax)',
    boxTitleAr: 'إجمالي ضريبة المخرجات المستحقة عن الفترة',
    amountBase: totalOutputNet,
    vatAmountBase: totalOutputVat,
    adjustmentAmountBase:
      box1Summary.adjustmentAmountBase + box7.adjustmentAmountBase,
    lineCount:
      box1Summary.lineCount +
      box2.lineCount +
      box3.lineCount +
      box4.lineCount +
      box5.lineCount +
      box6.lineCount +
      box7.lineCount,
    drillDownRecords: [
      ...box1Summary.drillDownRecords,
      ...box2.drillDownRecords,
      ...box3.drillDownRecords,
      ...box4.drillDownRecords,
      ...box5.drillDownRecords,
      ...box6.drillDownRecords,
      ...box7.drillDownRecords
    ]
  };

  // Box 9: Standard rated expenses (Recoverable Input Tax)
  const box9 = buildBox(
    '9',
    9,
    'Standard rated expenses (Recoverable Input Tax)',
    'المصروفات الخاضعة للنسبة الأساسية (ضريبة المدخلات القابلة للاسترداد)',
    box9Records
  );

  // Box 10: RCM Input Tax Recovery
  const box10 = buildBox(
    '10',
    10,
    'Supplies subject to reverse charge provisions (Input Tax)',
    'التوريدات الخاضعة لآلية الاحتساب العكسي (ضريبة المدخلات)',
    box10Records
  );

  // Box 11: Total value of expenses and recoverable tax (Total Input Tax)
  const totalInputVat = box9.vatAmountBase + box10.vatAmountBase;
  const totalInputNet = box9.amountBase + box10.amountBase;

  const box11: Vat201BoxSummary = {
    boxId: '11',
    boxNumber: 11,
    boxTitleEn: 'Total value of expenses and recoverable tax (Input Tax)',
    boxTitleAr: 'إجمالي قيمة المصروفات وضريبة المدخلات القابلة للاسترداد',
    amountBase: totalInputNet,
    vatAmountBase: totalInputVat,
    adjustmentAmountBase: box9.adjustmentAmountBase,
    lineCount: box9.lineCount + box10.lineCount,
    drillDownRecords: [...box9.drillDownRecords, ...box10.drillDownRecords]
  };

  // Box 12: Total due tax (equals Box 8)
  const box12: Vat201BoxSummary = {
    boxId: '12',
    boxNumber: 12,
    boxTitleEn: 'Total due tax for the period',
    boxTitleAr: 'إجمالي الضريبة المستحقة عن الفترة',
    amountBase: box8.amountBase,
    vatAmountBase: totalOutputVat,
    adjustmentAmountBase: box8.adjustmentAmountBase,
    lineCount: box8.lineCount,
    drillDownRecords: box8.drillDownRecords
  };

  // Box 13: Total recoverable tax (equals Box 11)
  const box13: Vat201BoxSummary = {
    boxId: '13',
    boxNumber: 13,
    boxTitleEn: 'Total recoverable tax for the period',
    boxTitleAr: 'إجمالي الضريبة القابلة للاسترداد عن الفترة',
    amountBase: box11.amountBase,
    vatAmountBase: totalInputVat,
    adjustmentAmountBase: box11.adjustmentAmountBase,
    lineCount: box11.lineCount,
    drillDownRecords: box11.drillDownRecords
  };

  // Box 14: Net VAT payable or recoverable
  const netVatPayable = totalOutputVat - totalInputVat;
  const allReturnRecords = [...box8.drillDownRecords, ...box11.drillDownRecords];
  const box14: Vat201BoxSummary = {
    boxId: '14',
    boxNumber: 14,
    boxTitleEn:
      netVatPayable >= 0n
        ? 'Net VAT payable for the period'
        : 'Net VAT recoverable for the period',
    boxTitleAr:
      netVatPayable >= 0n
        ? 'صافي الضريبة المستحقة السداد عن الفترة'
        : 'صافي الضريبة القابلة للاسترداد عن الفترة',
    amountBase: totalOutputNet,
    vatAmountBase: netVatPayable,
    adjustmentAmountBase: 0n,
    lineCount: allReturnRecords.length,
    drillDownRecords: allReturnRecords
  };

  const boxes: Vat201BoxSummary[] = [
    box1Summary,
    box2,
    box3,
    box4,
    box5,
    box6,
    box7,
    box8,
    box9,
    box10,
    box11,
    box12,
    box13,
    box14
  ];

  return {
    taxPeriod: period,
    taxRegistrationNumber: trn,
    boxes,
    emirateBreakdown,
    totalOutputTax: totalOutputVat,
    totalInputTax: totalInputVat,
    netTaxPayableOrReclaimable: netVatPayable,
    advisorVerificationRequired,
    warnings,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Returns point-in-time source transaction entries for a given box ID.
 * Supports Box 1 (all Emirates), 1a..1g (specific Emirate), and Boxes 2..13.
 */
export function getBoxDrillDown(
  calculation: Vat201ReturnCalculation,
  boxId: string
): VatDrillDownRecord[] {
  // Check Emirate sub-boxes (1a, 1b, etc.)
  for (const [em, summary] of Object.entries(calculation.emirateBreakdown)) {
    if (summary.boxId === boxId) {
      return summary.drillDownRecords;
    }
  }

  // Check main boxes
  const box = calculation.boxes.find((b) => b.boxId === boxId || String(b.boxNumber) === boxId);
  return box ? box.drillDownRecords : [];
}

export interface FtaAuditFileHeader {
  companyNameEn: string;
  companyNameAr: string;
  trn: string;
  taxPeriod: string;
  currency: string;
}

/**
 * Generates official FTA Tax Audit File (FAF) in standardized text format
 * commonly required by the Federal Tax Authority for formal tax audits.
 */
export function generateFtaAuditFile(
  calculation: Vat201ReturnCalculation,
  header: FtaAuditFileHeader
): string {
  const lines: string[] = [];

  // Header Section
  lines.push('--- FTA TAX AUDIT FILE (FAF) ---');
  lines.push(`Company Name (EN): ${header.companyNameEn}`);
  lines.push(`Company Name (AR): ${header.companyNameAr}`);
  lines.push(`Tax Registration Number (TRN): ${header.trn}`);
  lines.push(`Tax Period: ${header.taxPeriod}`);
  lines.push(`Functional Currency: ${header.currency}`);
  lines.push(`Generated Timestamp: ${calculation.generatedAt}`);
  lines.push('');

  // Summary Section
  lines.push('--- VAT 201 SUMMARY ---');
  lines.push('Box|Title|Amount (Fils)|VAT (Fils)|Adjustments (Fils)|Line Count');
  for (const box of calculation.boxes) {
    lines.push(
      `${box.boxId}|${box.boxTitleEn}|${box.amountBase}|${box.vatAmountBase}|${box.adjustmentAmountBase}|${box.lineCount}`
    );
  }
  lines.push('');

  // Sales Ledger Drill-Down (Box 1-8 items)
  lines.push('--- SALES LEDGER AUDIT DRILL-DOWN ---');
  lines.push(
    'Voucher ID|Doc Number|Date|Customer Name|Customer TRN|Tax Code|Emirate|Net (Fils)|VAT (Fils)|Description|Legal Reference'
  );
  const salesBox = calculation.boxes.find((b) => b.boxId === '8');
  if (salesBox) {
    for (const r of salesBox.drillDownRecords) {
      lines.push(
        `${r.voucherId}|${r.documentNumber}|${r.transactionDate}|${r.counterpartyName}|${r.counterpartyTrn ?? 'N/A'}|${r.taxCode}|${r.emirate ?? 'N/A'}|${r.netAmountBase}|${r.vatAmountBase}|${r.description}|${r.lawReference}`
      );
    }
  }
  lines.push('');

  // Purchase Ledger Drill-Down (Box 9-11 items)
  lines.push('--- PURCHASE LEDGER AUDIT DRILL-DOWN ---');
  lines.push(
    'Voucher ID|Doc Number|Date|Supplier Name|Supplier TRN|Tax Code|Net (Fils)|Recoverable VAT (Fils)|Description|Legal Reference'
  );
  const purchaseBox = calculation.boxes.find((b) => b.boxId === '11');
  if (purchaseBox) {
    for (const r of purchaseBox.drillDownRecords) {
      lines.push(
        `${r.voucherId}|${r.documentNumber}|${r.transactionDate}|${r.counterpartyName}|${r.counterpartyTrn ?? 'N/A'}|${r.taxCode}|${r.netAmountBase}|${r.vatAmountBase}|${r.description}|${r.lawReference}`
      );
    }
  }

  return lines.join('\n');
}
