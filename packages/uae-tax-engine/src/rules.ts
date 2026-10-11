export interface TaxRuleDefinition {
  ruleId: string;
  category: 'VAT' | 'CORPORATE_TAX' | 'EXCISE';
  code: string;
  rateBps: number; // e.g. 500 = 5.00%
  descriptionEn: string;
  descriptionAr: string;
  lawReference: string;
  effectiveFrom: string; // ISO date 'YYYY-MM-DD'
  effectiveTo?: string | null;
  verifyWithTaxAdvisor: boolean;
  box201Mapping?: number | string; // FTA VAT 201 Return Box number (e.g. '1a', '1b', 1, 2, 3, 4, 5, 6, 7, 9, 10)
  guidanceNote: string;
}

/**
 * Data-Driven, Versioned UAE Tax Rules
 * Reference: Federal Decree-Law No. 8 of 2017 (VAT), Federal Decree-Law No. 7 of 2017 (Excise),
 * and Federal Decree-Law No. 47 of 2022 (Corporate Tax)
 */
export const UAE_TAX_RULES: TaxRuleDefinition[] = [
  {
    ruleId: 'VAT-SR-001',
    category: 'VAT',
    code: 'SR_5',
    rateBps: 500,
    descriptionEn: 'Standard Rated Supplies (5%)',
    descriptionAr: 'التوريدات الخاضعة للنسبة الأساسية (5%)',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: 1,
    guidanceNote: 'Applies to commercial sales, professional services, and standard goods delivered in mainland UAE.'
  },
  {
    ruleId: 'VAT-SR-AUH',
    category: 'VAT',
    code: 'SR_5_AUH',
    rateBps: 500,
    descriptionEn: 'Standard Rated Supplies (5%) - Abu Dhabi',
    descriptionAr: 'التوريدات الخاضعة للنسبة الأساسية (5%) - أبوظبي',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3 & Executive Regulations',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: '1a',
    guidanceNote: 'Standard rated supplies performed or delivered in the Emirate of Abu Dhabi.'
  },
  {
    ruleId: 'VAT-SR-DXB',
    category: 'VAT',
    code: 'SR_5_DXB',
    rateBps: 500,
    descriptionEn: 'Standard Rated Supplies (5%) - Dubai',
    descriptionAr: 'التوريدات الخاضعة للنسبة الأساسية (5%) - دبي',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3 & Executive Regulations',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: '1b',
    guidanceNote: 'Standard rated supplies performed or delivered in the Emirate of Dubai.'
  },
  {
    ruleId: 'VAT-SR-SHJ',
    category: 'VAT',
    code: 'SR_5_SHJ',
    rateBps: 500,
    descriptionEn: 'Standard Rated Supplies (5%) - Sharjah',
    descriptionAr: 'التوريدات الخاضعة للنسبة الأساسية (5%) - الشارقة',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3 & Executive Regulations',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: '1c',
    guidanceNote: 'Standard rated supplies performed or delivered in the Emirate of Sharjah.'
  },
  {
    ruleId: 'VAT-SR-AJM',
    category: 'VAT',
    code: 'SR_5_AJM',
    rateBps: 500,
    descriptionEn: 'Standard Rated Supplies (5%) - Ajman',
    descriptionAr: 'التوريدات الخاضعة للنسبة الأساسية (5%) - عجمان',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3 & Executive Regulations',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: '1d',
    guidanceNote: 'Standard rated supplies performed or delivered in the Emirate of Ajman.'
  },
  {
    ruleId: 'VAT-SR-UAQ',
    category: 'VAT',
    code: 'SR_5_UAQ',
    rateBps: 500,
    descriptionEn: 'Standard Rated Supplies (5%) - Umm Al Quwain',
    descriptionAr: 'التوريدات الخاضعة للنسبة الأساسية (5%) - أم القيوين',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3 & Executive Regulations',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: '1e',
    guidanceNote: 'Standard rated supplies performed or delivered in the Emirate of Umm Al Quwain.'
  },
  {
    ruleId: 'VAT-SR-RAK',
    category: 'VAT',
    code: 'SR_5_RAK',
    rateBps: 500,
    descriptionEn: 'Standard Rated Supplies (5%) - Ras Al Khaimah',
    descriptionAr: 'التوريدات الخاضعة للنسبة الأساسية (5%) - رأس الخيمة',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3 & Executive Regulations',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: '1f',
    guidanceNote: 'Standard rated supplies performed or delivered in the Emirate of Ras Al Khaimah.'
  },
  {
    ruleId: 'VAT-SR-FUJ',
    category: 'VAT',
    code: 'SR_5_FUJ',
    rateBps: 500,
    descriptionEn: 'Standard Rated Supplies (5%) - Fujairah',
    descriptionAr: 'التوريدات الخاضعة للنسبة الأساسية (5%) - الفجيرة',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3 & Executive Regulations',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: '1g',
    guidanceNote: 'Standard rated supplies performed or delivered in the Emirate of Fujairah.'
  },
  {
    ruleId: 'VAT-TOURIST-001',
    category: 'VAT',
    code: 'TOURIST_REFUND',
    rateBps: 500,
    descriptionEn: 'Tax Invoices Issued to Tourists (Tax Refunds for Tourists Scheme)',
    descriptionAr: 'الفواتير الضريبية المصدرة للسياح (نظام رد الضريبة للسياح)',
    lawReference: 'Cabinet Decision No. 41 of 2018 on Tax Refunds for Tourists',
    effectiveFrom: '2018-11-18',
    verifyWithTaxAdvisor: false,
    box201Mapping: 2,
    guidanceNote: 'Retail purchases made by overseas tourists under the Planet Tax Free validation scheme.'
  },
  {
    ruleId: 'VAT-RCM-001',
    category: 'VAT',
    code: 'RCM_5',
    rateBps: 500,
    descriptionEn: 'Reverse Charge Mechanism (Imported Services / Goods)',
    descriptionAr: 'آلية الاحتساب العكسي للخدمات والسلع المستوردة',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 48',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: 3,
    guidanceNote: 'Recipient accounts for output tax in Box 3 and recovers input tax in Box 10 subject to standard recovery rules.'
  },
  {
    ruleId: 'VAT-ZR-001',
    category: 'VAT',
    code: 'ZR_EXP_0',
    rateBps: 0,
    descriptionEn: 'Zero-Rated Direct & Indirect Exports of Goods/Services',
    descriptionAr: 'الصادرات الخاضعة لنسبة الصفر خارج دول المجلس',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 45(1)',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: 4,
    guidanceNote: 'Applies to cross-border exports where customer is located outside implementing states and proof of exit exists.'
  },
  {
    ruleId: 'VAT-ZR-002',
    category: 'VAT',
    code: 'ZR_LOC_0',
    rateBps: 0,
    descriptionEn: 'Zero-Rated Domestic (Healthcare, Education, International Transport)',
    descriptionAr: 'التوريدات المحلية الخاضعة لنسبة الصفر (التعليم، الرعاية الصحية)',
    lawReference: 'Executive Regulation of Federal Decree-Law No. 8 of 2017, Articles 38-44',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: true,
    box201Mapping: 4,
    guidanceNote: 'Must strictly meet accredited curriculum and DHA/MOHAP licensing criteria. VERIFY WITH UAE TAX ADVISOR.'
  },
  {
    ruleId: 'VAT-ZR-PREC-001',
    category: 'VAT',
    code: 'ZR_INV_PREC',
    rateBps: 0,
    descriptionEn: 'Zero-Rated Investment Precious Metals (Gold/Silver/Platinum 99%+ purity)',
    descriptionAr: 'المعادن الثمينة الاستثمارية الخاضعة لنسبة الصفر',
    lawReference: 'Executive Regulation of Federal Decree-Law No. 8 of 2017, Article 41',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: true,
    box201Mapping: 4,
    guidanceNote: 'Supplies of precious metals with purity >= 99% traded in accredited bullion markets. VERIFY WITH UAE TAX ADVISOR.'
  },
  {
    ruleId: 'VAT-EX-001',
    category: 'VAT',
    code: 'EX_FIN',
    rateBps: 0,
    descriptionEn: 'Exempt Financial Services (Margin/Interest Based)',
    descriptionAr: 'الخدمات المالية المعفاة من الضريبة (القائمة على الهامش/الفائدة)',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 46(1)',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: true,
    box201Mapping: 5,
    guidanceNote: 'Fee-based financial services remain standard rated 5%. Interest, loan margins and life insurance are exempt. VERIFY WITH UAE TAX ADVISOR.'
  },
  {
    ruleId: 'VAT-EX-002',
    category: 'VAT',
    code: 'EX_RES',
    rateBps: 0,
    descriptionEn: 'Exempt Residential Real Estate Leases',
    descriptionAr: 'عقارات سكنية معفاة (عقود الإيجار السكنية)',
    lawReference: 'Executive Regulation of Federal Decree-Law No. 8 of 2017, Article 37',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: 5,
    guidanceNote: 'Residential leases after 3 years from construction completion are exempt.'
  },
  {
    ruleId: 'VAT-EX-TRANS',
    category: 'VAT',
    code: 'EX_LOCAL_TRANS',
    rateBps: 0,
    descriptionEn: 'Exempt Local Passenger Transport',
    descriptionAr: 'النقل المحلي للركاب المعفى من الضريبة',
    lawReference: 'Executive Regulation of Federal Decree-Law No. 8 of 2017, Article 45',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: 5,
    guidanceNote: 'Local passenger transport by bus, taxi, or metro within the UAE is exempt.'
  },
  {
    ruleId: 'VAT-CUSTOMS-001',
    category: 'VAT',
    code: 'CUSTOMS_IMPORT_5',
    rateBps: 500,
    descriptionEn: 'Goods Imported into the UAE (Customs Declaration via Ports)',
    descriptionAr: 'السلع المستوردة إلى الدولة عبر المنافذ الجمركية',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 48 & Customs Integration',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: 6,
    guidanceNote: 'Auto-populated via FTA customs declaration linking to taxable importer TRN.'
  },
  {
    ruleId: 'VAT-CUSTOMS-ADJ',
    category: 'VAT',
    code: 'CUSTOMS_ADJ',
    rateBps: 500,
    descriptionEn: 'Adjustments to Goods Imported into UAE',
    descriptionAr: 'تعديلات على السلع المستوردة إلى الدولة',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 48',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: true,
    box201Mapping: 7,
    guidanceNote: 'Manual adjustments when customs declaration values differ from actual invoice figures. VERIFY WITH UAE TAX ADVISOR.'
  },
  {
    ruleId: 'VAT-INP-SR-001',
    category: 'VAT',
    code: 'INPUT_SR_5',
    rateBps: 500,
    descriptionEn: 'Standard Rated Expenses (Recoverable Input Tax)',
    descriptionAr: 'المصروفات الخاضعة للنسبة الأساسية (ضريبة المدخلات القابلة للاسترداد)',
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 54',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: false,
    box201Mapping: 9,
    guidanceNote: 'Standard recoverable business expenses supported by valid tax invoices showing supplier TRN.'
  },
  {
    ruleId: 'VAT-INP-BLOCKED-001',
    category: 'VAT',
    code: 'INPUT_BLOCKED_5',
    rateBps: 500,
    descriptionEn: 'Non-Recoverable Input Tax (Client Entertainment / Personal Motor Vehicles)',
    descriptionAr: 'ضريبة المدخلات غير القابلة للاسترداد (الضيافة والترفيه لغير الموظفين)',
    lawReference: 'Executive Regulation of Federal Decree-Law No. 8 of 2017, Article 53',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: true,
    box201Mapping: 9,
    guidanceNote: 'Input VAT cannot be recovered on entertainment provided to non-employees or motor vehicles available for personal use. VERIFY WITH UAE TAX ADVISOR.'
  },
  {
    ruleId: 'VAT-DZ-001',
    category: 'VAT',
    code: 'DZ_GOODS',
    rateBps: 0,
    descriptionEn: 'Supplies of Goods within Designated Zones',
    descriptionAr: 'توريد السلع داخل المناطق المحددة',
    lawReference: 'Cabinet Decision No. 59 of 2017 on Designated Zones',
    effectiveFrom: '2018-01-01',
    verifyWithTaxAdvisor: true,
    guidanceNote: 'Out of scope or zero rated only if goods remain within customs perimeter and are not consumed within the zone. VERIFY WITH UAE TAX ADVISOR.'
  },
  {
    ruleId: 'EXCISE-CARB-001',
    category: 'EXCISE',
    code: 'EXCISE_50',
    rateBps: 5000,
    descriptionEn: 'Excise Tax (50%) on Carbonated & Sweetened Beverages',
    descriptionAr: 'الضريبة الانتقائية (50%) على المشروبات الغازية والمحلاة',
    lawReference: 'Cabinet Decision No. 52 of 2019 on Excise Goods Rates',
    effectiveFrom: '2019-12-01',
    verifyWithTaxAdvisor: false,
    guidanceNote: 'Applies to carbonated beverages and sweetened drinks containing added sugar.'
  },
  {
    ruleId: 'EXCISE-ENERGY-001',
    category: 'EXCISE',
    code: 'EXCISE_100',
    rateBps: 10000,
    descriptionEn: 'Excise Tax (100%) on Energy Drinks, Tobacco, & E-Cigarettes',
    descriptionAr: 'الضريبة الانتقائية (100%) على مشروبات الطاقة ومنتجات التبغ وأجهزة التدخين الإلكتروني',
    lawReference: 'Federal Decree-Law No. 7 of 2017 & Cabinet Decision No. 52 of 2019',
    effectiveFrom: '2017-10-01',
    verifyWithTaxAdvisor: false,
    guidanceNote: 'Applies to energy drinks, tobacco products, electronic smoking devices, and nicotine liquids.'
  },
  {
    ruleId: 'CT-GEN-001',
    category: 'CORPORATE_TAX',
    code: 'CT_STANDARD_9',
    rateBps: 900, // 9.00%
    descriptionEn: 'Standard Corporate Tax on Taxable Income exceeding AED 375,000',
    descriptionAr: 'ضريبة الشركات الأساسية بنسبة 9% على الدخل الذي يتجاوز 375 ألف درهم',
    lawReference: 'Federal Decree-Law No. 47 of 2022, Article 3',
    effectiveFrom: '2023-06-01',
    verifyWithTaxAdvisor: false,
    guidanceNote: '0% on first AED 375,000 taxable net profit; 9% on excess.'
  },
  {
    ruleId: 'CT-QFZP-001',
    category: 'CORPORATE_TAX',
    code: 'CT_QFZP_0',
    rateBps: 0,
    descriptionEn: 'Qualifying Free Zone Person 0% Qualifying Income',
    descriptionAr: 'الشخص القائم في المنطقة الحرة المؤهل بنسبة 0% على الدخل المؤهل',
    lawReference: 'Cabinet Decision No. 139 of 2023 & Ministerial Decision No. 265 of 2023',
    effectiveFrom: '2023-06-01',
    verifyWithTaxAdvisor: true,
    guidanceNote: 'Entity must maintain adequate substance, earn qualifying income, comply with transfer pricing, and satisfy de-minimis requirement (<= 5% of revenue or AED 5,000,000). VERIFY WITH UAE TAX ADVISOR.'
  }
];

export function getTaxRuleByCode(code: string): TaxRuleDefinition | undefined {
  return UAE_TAX_RULES.find((r) => r.code === code);
}
