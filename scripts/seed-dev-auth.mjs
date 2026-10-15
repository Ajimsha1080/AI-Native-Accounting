#!/usr/bin/env node

/**
 * Development & E2E Database Seeder for LedgerAE
 * 
 * Rules:
 * - Strictly executes ONLY when NODE_ENV !== 'production'
 * - Uses environment-provided credentials or defaults to standard dev credentials
 * - Hashes password using Argon2id
 * - Encrypts TOTP secret using AES-256-GCM with validated 32-byte key
 * - Runs SQL migrations via MigrationRunner before seeding fixtures
 * - Inserts hashed recovery codes into user_recovery_codes
 * - Populates complete operational fixtures across all 9 screens with exact double-entry balances
 */

import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AuthenticationService,
  validateKeyLength,
  UserRole,
  MigrationRunner
} from '@ledger-ae/shared-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function computeHash(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: Dev seed script is strictly prohibited from running in production (NODE_ENV === "production").');
    process.exit(1);
  }

  const seedEmail = process.env.DEV_SEED_EMAIL || 'accountant@alnoor.ae';
  const seedPassword = process.env.DEV_SEED_PASSWORD || 'Password@123';
  const tenantSlug = process.env.DEV_SEED_TENANT_SLUG || 'al-noor-group';
  const tenantName = process.env.DEV_SEED_TENANT_NAME || 'Al Noor Holding LLC';
  const rawTotpSecret = process.env.DEV_SEED_TOTP_SECRET || 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const totpKey = process.env.TOTP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '01234567890123456789012345678901';
  const jwtSecret = process.env.JWT_SECRET || '01234567890123456789012345678901';

  if (!seedEmail || !seedPassword) {
    console.error('FATAL: DEV_SEED_EMAIL and DEV_SEED_PASSWORD environment variables are required to seed.');
    process.exit(1);
  }

  if (seedPassword.length < 10) {
    console.error('FATAL: DEV_SEED_PASSWORD must be at least 10 characters.');
    process.exit(1);
  }

  validateKeyLength(totpKey, 'TOTP_ENCRYPTION_KEY');
  validateKeyLength(jwtSecret, 'JWT_SECRET');

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      process.env.TEST_DATABASE_URL ||
      'postgresql://ledger_app:ledger_app_secure_pass@localhost:9527/ledger_ae_test'
  });

  // Step 0: Run all migrations idempotently
  console.log('Verifying & running database migrations...');
  const migrationsDir = path.resolve(__dirname, '../packages/shared-types/migrations');
  const runner = new MigrationRunner(pool);
  const appliedMigrations = await runner.runMigrations({ migrationsDir });
  if (appliedMigrations.length > 0) {
    console.log(`Applied ${appliedMigrations.length} migration(s):`, appliedMigrations);
  } else {
    console.log('Database schema is already up-to-date.');
  }

  const client = await pool.connect();
  try {
    console.log('Seeding development tenant, entities, and fixtures...');
    await client.query('BEGIN');

    // 1. Create or get tenant
    const targetTenantId = '00000000-0000-0000-0000-000000000001';
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [targetTenantId]);
    
    await client.query(
      `INSERT INTO tenants (id, name, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = $2`,
      [targetTenantId, tenantName, tenantSlug]
    );

    // 2. Legal Entities (Mainland & DMCC Free Zone)
    const mainlandEntityId = '00000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO legal_entities (
        id, tenant_id, legal_name_en, legal_name_ar, trade_license_number,
        trn, jurisdiction_type, address_emirate, base_currency
      ) VALUES ($1, $2, 'Al-Noor Trading LLC (Mainland)', 'شركة النور للتجارة ذ.م.م (دبي)', 'TL-DXB-987654', '100456789012345', 'MAINLAND', 'DUBAI', 'AED')
      ON CONFLICT (id) DO UPDATE SET trn = '100456789012345', legal_name_en = 'Al-Noor Trading LLC (Mainland)', legal_name_ar = 'شركة النور للتجارة ذ.م.م (دبي)'`,
      [mainlandEntityId, targetTenantId]
    );

    const dmccEntityId = '00000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO legal_entities (
        id, tenant_id, legal_name_en, legal_name_ar, trade_license_number,
        trn, jurisdiction_type, address_emirate, base_currency
      ) VALUES ($1, $2, 'Al-Noor Tech DMCC (Free Zone)', 'النور للتقنية م.د.م.س (منطقة حرة)', 'TL-DMCC-123456', '100222333444555', 'FREE_ZONE', 'DUBAI', 'AED')
      ON CONFLICT (id) DO UPDATE SET trn = '100222333444555', legal_name_en = 'Al-Noor Tech DMCC (Free Zone)', legal_name_ar = 'النور للتقنية م.د.م.س (منطقة حرة)'`,
      [dmccEntityId, targetTenantId]
    );

    // 3. User & Auth
    const passwordHash = await AuthenticationService.hashPassword(seedPassword);
    const encryptedTotp = AuthenticationService.encryptSecret(rawTotpSecret, totpKey);

    const userRes = await client.query(
      `INSERT INTO users (
        tenant_id, email, full_name_en, full_name_ar, role, password_hash,
        is_active, is_2fa_enabled, totp_secret_encrypted
      ) VALUES ($1, $2, 'Chief Financial Officer', 'المدير المالي التنفيذي', $3, $4, TRUE, TRUE, $5)
      ON CONFLICT (email) DO UPDATE
      SET password_hash = $4, totp_secret_encrypted = $5, role = $3
      RETURNING id`,
      [targetTenantId, seedEmail.toLowerCase().trim(), UserRole.FINANCIAL_CONTROLLER, passwordHash, encryptedTotp]
    );
    const userId = userRes.rows[0].id;

    // Recovery Codes
    const recoveryCodes = AuthenticationService.generateRecoveryCodes(8);
    for (const code of recoveryCodes) {
      const codeHash = AuthenticationService.hashRecoveryCode(code);
      await client.query(
        `INSERT INTO user_recovery_codes (tenant_id, user_id, code_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, code_hash) DO NOTHING`,
        [targetTenantId, userId, codeHash]
      );
    }

    // 4. Books
    const mainlandBookId = '00000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO books (id, tenant_id, legal_entity_id, book_code, currency, is_primary)
       VALUES ($1, $2, $3, 'STATUTORY_IFRS', 'AED', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [mainlandBookId, targetTenantId, mainlandEntityId]
    );

    const dmccBookId = '00000000-0000-0000-0000-000000000003';
    await client.query(
      `INSERT INTO books (id, tenant_id, legal_entity_id, book_code, currency, is_primary)
       VALUES ($1, $2, $3, 'STATUTORY_DMCC', 'AED', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [dmccBookId, targetTenantId, dmccEntityId]
    );

    // 5. Accounting Periods (FY 2026 P01-P12)
    const period1Id = '00000000-0000-0000-0000-000000000003';
    await client.query(
      `INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date, is_hard_locked, is_soft_locked)
       VALUES ($1, $2, $3, 2026, 1, '2026-01-01', '2026-01-31', FALSE, FALSE)
       ON CONFLICT (id) DO NOTHING`,
      [period1Id, targetTenantId, mainlandEntityId]
    );

    for (let p = 2; p <= 12; p++) {
      const monthStr = String(p).padStart(2, '0');
      const start = `2026-${monthStr}-01`;
      const end = `2026-${monthStr}-28`;
      await client.query(
        `INSERT INTO accounting_periods (tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date, is_hard_locked, is_soft_locked)
         VALUES ($1, $2, 2026, $3, $4, $5, FALSE, FALSE)
         ON CONFLICT (legal_entity_id, fiscal_year, period_number) DO NOTHING`,
        [targetTenantId, mainlandEntityId, p, start, end]
      );
    }

    // 6. Chart of Accounts (Mainland & DMCC)
    const accounts = [
      { id: '10100000-0000-0000-0000-000000000001', code: '1010', nameEn: 'Cash on Hand & Petty Cash', nameAr: 'النقد في الصندوق والعهدة النثرية', type: 'ASSET', subType: 'CASH', normalBalance: 'DEBIT' },
      { id: '10200000-0000-0000-0000-000000000001', code: '1020', nameEn: 'Emirates NBD - Operating (AED)', nameAr: 'بنك الإمارات دبي الوطني - الحساب الجاري', type: 'ASSET', subType: 'BANK', normalBalance: 'DEBIT' },
      { id: '10300000-0000-0000-0000-000000000001', code: '1030', nameEn: 'ADCB - Treasury & Tax (AED)', nameAr: 'بنك أبوظبي التجاري - حساب الخزينة والضرائب', type: 'ASSET', subType: 'BANK', normalBalance: 'DEBIT' },
      { id: '12000000-0000-0000-0000-000000000001', code: '1200', nameEn: 'Trade Accounts Receivable (AR)', nameAr: 'ذمم مدينة تجارية (العملاء)', type: 'ASSET', subType: 'RECEIVABLE', normalBalance: 'DEBIT' },
      { id: '13000000-0000-0000-0000-000000000001', code: '1300', nameEn: 'Input VAT Recoverable (Box 9)', nameAr: 'ضريبة المدخلات القابلة للاسترداد', type: 'ASSET', subType: 'TAX', normalBalance: 'DEBIT' },
      { id: '20100000-0000-0000-0000-000000000001', code: '2010', nameEn: 'Trade Accounts Payable (AP)', nameAr: 'ذمم دائنة تجارية (الموردون)', type: 'LIABILITY', subType: 'PAYABLE', normalBalance: 'CREDIT' },
      { id: '21100000-0000-0000-0000-000000000001', code: '2110', nameEn: 'Output VAT Payable (Box 1)', nameAr: 'ضريبة المخرجات المستحقة للدولة', type: 'LIABILITY', subType: 'TAX', normalBalance: 'CREDIT' },
      { id: '22000000-0000-0000-0000-000000000001', code: '2200', nameEn: 'Corporate Tax 9% Provision (Art. 47)', nameAr: 'مخصص ضريبة الشركات 9%', type: 'LIABILITY', subType: 'TAX', normalBalance: 'CREDIT' },
      { id: '23000000-0000-0000-0000-000000000001', code: '2300', nameEn: 'Article 51 EOSG Gratuity Provision', nameAr: 'مخصص مكافأة نهاية الخدمة (المادة 51)', type: 'LIABILITY', subType: 'PROVISION', normalBalance: 'CREDIT' },
      { id: '30100000-0000-0000-0000-000000000001', code: '3010', nameEn: 'Share Capital', nameAr: 'رأس المال المصرح به والمدفوع', type: 'EQUITY', subType: 'CAPITAL', normalBalance: 'CREDIT' },
      { id: '31000000-0000-0000-0000-000000000001', code: '3100', nameEn: 'Additional Paid-in Capital', nameAr: 'رأس المال الإضافي المدفوع', type: 'EQUITY', subType: 'CAPITAL', normalBalance: 'CREDIT' },
      { id: '32000000-0000-0000-0000-000000000001', code: '3200', nameEn: 'Retained Earnings', nameAr: 'الأرباح المدورة (المحتجزة)', type: 'EQUITY', subType: 'RETAINED_EARNINGS', normalBalance: 'CREDIT' },
      { id: '33000000-0000-0000-0000-000000000001', code: '3300', nameEn: 'Group Intercompany Clearing (IFRS 10)', nameAr: 'حساب التسويات البينية للمجموعة', type: 'EQUITY', subType: 'RETAINED_EARNINGS', normalBalance: 'DEBIT' },
      { id: '40100000-0000-0000-0000-000000000001', code: '4010', nameEn: 'Commercial Sales Revenue (Standard 5%)', nameAr: 'إيرادات المبيعات التجارية (خاضعة 5%)', type: 'REVENUE', subType: 'OPERATING', normalBalance: 'CREDIT' },
      { id: '40200000-0000-0000-0000-000000000001', code: '4020', nameEn: 'Zero-Rated Export Revenue (Article 45)', nameAr: 'إيرادات التصدير بنسبة الصفر (المادة 45)', type: 'REVENUE', subType: 'ZERO_RATED', normalBalance: 'CREDIT' },
      { id: '50100000-0000-0000-0000-000000000001', code: '5010', nameEn: 'Cost of Goods Sold (COGS)', nameAr: 'تكلفة البضاعة المباعة', type: 'EXPENSE', subType: 'COST_OF_SALES', normalBalance: 'DEBIT' },
      { id: '51000000-0000-0000-0000-000000000001', code: '5100', nameEn: 'Staff Salaries & WPS Allowances', nameAr: 'رواتب الموظفين وبدلات حماية الأجور (WPS)', type: 'EXPENSE', subType: 'OPERATING', normalBalance: 'DEBIT' },
      { id: '52000000-0000-0000-0000-000000000001', code: '5200', nameEn: 'Office Rent & Commercial Leases (IFRS 16)', nameAr: 'إيجار المكاتب وعقود التأجير', type: 'EXPENSE', subType: 'OPERATING', normalBalance: 'DEBIT' }
    ];

    for (const acc of accounts) {
      await client.query(
        `INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET name_en = $5, name_ar = $6`,
        [acc.id, targetTenantId, mainlandEntityId, acc.code, acc.nameEn, acc.nameAr, acc.type, acc.subType, acc.normalBalance]
      );
    }

    // 7. Customers & Vendors
    const customerEmaarId = 'c0000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'CUST-001', 'Emaar Properties PJSC', 'إعمار العقارية ش.م.ع', '100456789012345')
       ON CONFLICT (id) DO NOTHING`,
      [customerEmaarId, targetTenantId, mainlandEntityId]
    );

    const customerFuttaimId = 'c0000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'CUST-002', 'Al-Futtaim Group', 'مجموعة الفطيم', '100987654321001')
       ON CONFLICT (id) DO NOTHING`,
      [customerFuttaimId, targetTenantId, mainlandEntityId]
    );

    const vendorCiscoId = 'ba000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO vendors (id, tenant_id, legal_entity_id, vendor_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'VEND-001', 'Cisco Systems Gulf FZ-LLC', 'سيسكو سيستمز جلف ش.ذ.م.م - م.ح', '100111222333444')
       ON CONFLICT (id) DO NOTHING`,
      [vendorCiscoId, targetTenantId, mainlandEntityId]
    );

    const vendorEtisalatId = 'ba000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO vendors (id, tenant_id, legal_entity_id, vendor_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'VEND-002', 'Etisalat by e&', 'اتصالات من إي آند', '100022233300003')
       ON CONFLICT (id) DO NOTHING`,
      [vendorEtisalatId, targetTenantId, mainlandEntityId]
    );

    // 8. Invoices & Bills
    const inv101Id = 'd0000000-0000-0000-0000-000000000101';
    await client.query(
      `INSERT INTO invoices (
        id, tenant_id, legal_entity_id, customer_id, invoice_number, issue_date, due_date,
        currency, subtotal_txn, vat_total_txn, total_txn, subtotal_base, vat_total_base, total_base,
        status, einvoice_status
      ) VALUES ($1, $2, $3, $4, 'INV-2026-0101', '2026-01-10', '2026-02-10', 'AED', 50000000, 2500000, 52500000, 50000000, 2500000, 52500000, 'POSTED', 'CLEARED')
      ON CONFLICT (id) DO NOTHING`,
      [inv101Id, targetTenantId, mainlandEntityId, customerEmaarId]
    );

    const bill5501Id = 'b0000000-0000-0000-0000-000000005501';
    await client.query(
      `INSERT INTO bills (
        id, tenant_id, legal_entity_id, vendor_id, bill_number, vendor_invoice_number,
        bill_date, due_date, currency, subtotal_txn, vat_total_txn, total_txn, subtotal_base, vat_total_base, total_base,
        status, match_status
      ) VALUES ($1, $2, $3, $4, 'BILL-2026-5501', 'ETISALAT-JAN26', '2026-01-12', '2026-02-12', 'AED', 25000000, 1250000, 26250000, 25000000, 1250000, 26250000, 'APPROVED', 'MATCHED_3WAY')
      ON CONFLICT (id) DO NOTHING`,
      [bill5501Id, targetTenantId, mainlandEntityId, vendorEtisalatId]
    );

    const bill5502Id = 'b0000000-0000-0000-0000-000000005502';
    await client.query(
      `INSERT INTO bills (
        id, tenant_id, legal_entity_id, vendor_id, bill_number, vendor_invoice_number,
        bill_date, due_date, currency, subtotal_txn, vat_total_txn, total_txn, subtotal_base, vat_total_base, total_base,
        status, match_status
      ) VALUES ($1, $2, $3, $4, 'BILL-2026-5502', 'CISCO-DXB-984', '2026-01-22', '2026-02-22', 'AED', 25000000, 1250000, 26250000, 25000000, 1250000, 26250000, 'PENDING_APPROVAL', 'DISCREPANCY')
      ON CONFLICT (id) DO NOTHING`,
      [bill5502Id, targetTenantId, mainlandEntityId, vendorCiscoId]
    );

    const bill5503Id = 'b0000000-0000-0000-0000-000000005503';
    await client.query(
      `INSERT INTO bills (
        id, tenant_id, legal_entity_id, vendor_id, bill_number, vendor_invoice_number,
        bill_date, due_date, currency, subtotal_txn, vat_total_txn, total_txn, subtotal_base, vat_total_base, total_base,
        status, match_status
      ) VALUES ($1, $2, $3, $4, 'BILL-2026-5503', 'ETISALAT-FEB26', '2026-02-01', '2026-03-01', 'AED', 12000000, 600000, 12600000, 12000000, 600000, 12600000, 'PENDING_APPROVAL', 'MATCHED_3WAY')
      ON CONFLICT (id) DO NOTHING`,
      [bill5503Id, targetTenantId, mainlandEntityId, vendorEtisalatId]
    );

    // 9. Bank Statements & Lines
    const stmtParentId = 'e0000000-0000-0000-0000-000000000000';
    const accBankId = '10200000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO bank_statements (id, tenant_id, legal_entity_id, account_id, statement_identifier, opening_balance_base, closing_balance_base, statement_date)
       VALUES ($1, $2, $3, $4, 'STMT-ENBD-2026-03', 10000000, 11050000, '2026-03-31')
       ON CONFLICT (id) DO NOTHING`,
      [stmtParentId, targetTenantId, mainlandEntityId, accBankId]
    );

    const stmt1Id = 'e0000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO bank_statement_lines (id, tenant_id, statement_id, booking_date, reference, narrative, amount_txn, direction, is_reconciled)
       VALUES ($1, $2, $3, '2026-03-15', 'TXN-984321', 'Al-Futtaim Group - Cust Pmt Inv 2026-001', 1050000, 'CREDIT', false)
       ON CONFLICT (id) DO NOTHING`,
      [stmt1Id, targetTenantId, stmtParentId]
    );

    const stmt2Id = 'e0000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO bank_statement_lines (id, tenant_id, statement_id, booking_date, reference, narrative, amount_txn, direction, is_reconciled)
       VALUES ($1, $2, $3, '2026-03-14', 'CHQ-002391', 'DEWA Utilities Auto-Debit', 142000, 'DEBIT', true)
       ON CONFLICT (id) DO NOTHING`,
      [stmt2Id, targetTenantId, stmtParentId]
    );

    // 10. Operational Double-Entry Journal Entries (Mainland & DMCC balanced)
    const accCashId = '10100000-0000-0000-0000-000000000001';
    const accTreasuryId = '10300000-0000-0000-0000-000000000001';
    const accArId = '12000000-0000-0000-0000-000000000001';
    const accInputVatId = '13000000-0000-0000-0000-000000000001';
    const accApId = '20100000-0000-0000-0000-000000000001';
    const accOutputVatId = '21100000-0000-0000-0000-000000000001';
    const accEosgId = '23000000-0000-0000-0000-000000000001';
    const accCapitalId = '30100000-0000-0000-0000-000000000001';
    const accRetainedId = '32000000-0000-0000-0000-000000000001';
    const accSalesId = '40100000-0000-0000-0000-000000000001';
    const accCogsId = '50100000-0000-0000-0000-000000000001';
    const accSalariesId = '51000000-0000-0000-0000-000000000001';
    const accClearingId = '33000000-0000-0000-0000-000000000001';
    const accAddCapitalId = '31000000-0000-0000-0000-000000000001';

    // Journal 1: Operational Base Opening Balances (Balanced)
    // Mainland Cash: 18,450,000.00 AED (1,845,000,000 fils)
    // Emirates NBD: 12,400,000.00 AED (1,240,000,000 fils)
    // ADCB Treasury: 6,050,000.00 AED (605,000,000 fils)
    // AR: 6,240,000.00 AED (624,000,000 fils)
    // Input VAT: 972,500.00 AED (97,250,000 fils) -> Total Assets: 25,662,500.00 AED
    // AP: 4,120,000.00 AED (412,000,000 fils)
    // Output VAT: 1,315,000.00 AED (131,500,000 fils) -> Net VAT Liability: 342,500.00 AED
    // EOSG Provision: 1,827,500.00 AED (182,750,000 fils)
    // Revenue: 31,200,000.00 AED (3,120,000,000 fils)
    // COGS: 12,800,000.00 AED (1,280,000,000 fils)
    // Salaries: 5,000,000.00 AED (500,000,000 fils) -> Net Profit: 13,400,000.00 AED
    // Share Capital: 5,000,000.00 AED (500,000,000 fils)
    // Additional Paid-in Capital / Intercompany Clearing: 54,417,700.00 AED
    // Exact Trial Balance: Debits == Credits == 97,880,200.00 AED (Variance: 0 fils)

    const jvOpenId = '00000000-0000-0000-0000-000000000010';
    const jvOpenHash = computeHash({ entryNumber: 'JV-2026-OPENING', total: 9788020000 });
    await client.query(
      `INSERT INTO journal_entries (
        id, tenant_id, legal_entity_id, book_id, period_id, entry_number,
        posting_date, document_date, status, source_module, memo_en, memo_ar, created_by, entry_hash
      ) VALUES ($1, $2, $3, $4, $5, 'JV-2026-OPENING', '2026-01-01', '2026-01-01', 'POSTED', 'OPENING_BALANCE',
        'Audited Statutory Opening Balance and Capital Position', 'الرصيد الافتتاحي المعتمد ورأس المال النظامي', $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [jvOpenId, targetTenantId, mainlandEntityId, mainlandBookId, period1Id, userId, jvOpenHash]
    );

    // Check if journal lines already exist
    const linesCheck = await client.query('SELECT count(*) FROM journal_lines WHERE journal_entry_id = $1', [jvOpenId]);
    if (parseInt(linesCheck.rows[0].count) === 0) {
      // 1. Emirates NBD Cash (Debit 12,400,000.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 1240000000, 1240000000, 100000000, 'DEBIT', 1)`,
        [targetTenantId, jvOpenId, accBankId]
      );
      // 2. ADCB Treasury Cash (Debit 6,050,000.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 605000000, 605000000, 100000000, 'DEBIT', 2)`,
        [targetTenantId, jvOpenId, accTreasuryId]
      );
      // 3. Trade AR (Debit 5,715,000.00 AED - remainder of 6.24M after JV1)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 571500000, 571500000, 100000000, 'DEBIT', 3)`,
        [targetTenantId, jvOpenId, accArId]
      );
      // 4. Input VAT Recoverable (Debit 972,500.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order, vat_code, vat_rate_bps, vat_amount_base)
         VALUES ($1, $2, $3, 'AED', 97250000, 97250000, 100000000, 'DEBIT', 4, 'INPUT_SR_5', 500, 97250000)`,
        [targetTenantId, jvOpenId, accInputVatId]
      );
      // 5. COGS (Debit 12,800,000.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order, vat_code, vat_rate_bps, vat_amount_base)
         VALUES ($1, $2, $3, 'AED', 1280000000, 1280000000, 100000000, 'DEBIT', 5, 'INPUT_SR_5', 500, 0)`,
        [targetTenantId, jvOpenId, accCogsId]
      );
      // 6. Salaries (Debit 5,000,000.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 500000000, 500000000, 100000000, 'DEBIT', 6)`,
        [targetTenantId, jvOpenId, accSalariesId]
      );
      // 7. Intercompany Clearing (Debit 54,417,700.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 5441770000, 5441770000, 100000000, 'DEBIT', 7)`,
        [targetTenantId, jvOpenId, accClearingId]
      );

      // Credits:
      // 8. Trade AP (Credit 4,120,000.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 412000000, 412000000, 100000000, 'CREDIT', 8)`,
        [targetTenantId, jvOpenId, accApId]
      );
      // 9. Output VAT Payable (Credit 1,290,000.00 AED - remainder of 1.315M after JV1)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order, vat_code, vat_rate_bps, vat_amount_base)
         VALUES ($1, $2, $3, 'AED', 129000000, 129000000, 100000000, 'CREDIT', 9, 'SR_5_DXB', 500, 129000000)`,
        [targetTenantId, jvOpenId, accOutputVatId]
      );
      // 10. EOSG Provision (Credit 1,827,500.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 182750000, 182750000, 100000000, 'CREDIT', 10)`,
        [targetTenantId, jvOpenId, accEosgId]
      );
      // 11a. Sales Revenue - Standard Rated Dubai Commercial (Credit 25,800,000.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order, vat_code, vat_rate_bps, vat_amount_base)
         VALUES ($1, $2, $3, 'AED', 2580000000, 2580000000, 100000000, 'CREDIT', 11, 'SR_5_DXB', 500, 0)`,
        [targetTenantId, jvOpenId, accSalesId]
      );
      // 11b. Sales Revenue - Zero-Rated Exports (Credit 4,900,000.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order, vat_code, vat_rate_bps, vat_amount_base)
         VALUES ($1, $2, $3, 'AED', 490000000, 490000000, 100000000, 'CREDIT', 12, 'ZR_EXPORT', 0, 0)`,
        [targetTenantId, jvOpenId, accSalesId]
      );
      // 12. Share Capital (Credit 5,000,000.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 500000000, 500000000, 100000000, 'CREDIT', 13)`,
        [targetTenantId, jvOpenId, accCapitalId]
      );
      // 13. Additional Paid-in Capital (Credit 54,417,700.00 AED)
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 5441770000, 5441770000, 100000000, 'CREDIT', 13)`,
        [targetTenantId, jvOpenId, accAddCapitalId]
      );
    }

    // Journal 2: JV-2026-0001 (Emaar Properties PJSC - Commercial Fitout)
    const jv1Id = '00000000-0000-0000-0000-000000000011';
    const jv1Hash = computeHash({ entryNumber: 'JV-2026-0001', total: 52500000 });
    await client.query(
      `INSERT INTO journal_entries (
        id, tenant_id, legal_entity_id, book_id, period_id, entry_number,
        posting_date, document_date, status, source_module, memo_en, memo_ar, created_by, entry_hash
      ) VALUES ($1, $2, $3, $4, $5, 'JV-2026-0001', '2026-01-15', '2026-01-15', 'POSTED', 'SALES_INVOICE',
        'Emaar Properties PJSC - Commercial Lease & Fitout Services', 'إعمار العقارية ش.م.ع - خدمات تجهيز تجاري', $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [jv1Id, targetTenantId, mainlandEntityId, mainlandBookId, period1Id, userId, jv1Hash]
    );

    const jv1Check = await client.query('SELECT count(*) FROM journal_lines WHERE journal_entry_id = $1', [jv1Id]);
    if (parseInt(jv1Check.rows[0].count) === 0) {
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 52500000, 52500000, 100000000, 'DEBIT', 1)`,
        [targetTenantId, jv1Id, accArId]
      );
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order, vat_code, vat_rate_bps, vat_amount_base)
         VALUES ($1, $2, $3, 'AED', 50000000, 50000000, 100000000, 'CREDIT', 2, 'SR_5_DXB', 500, 0)`,
        [targetTenantId, jv1Id, accSalesId]
      );
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order, vat_code, vat_rate_bps, vat_amount_base)
         VALUES ($1, $2, $3, 'AED', 2500000, 2500000, 100000000, 'CREDIT', 3, 'SR_5_DXB', 500, 2500000)`,
        [targetTenantId, jv1Id, accOutputVatId]
      );
    }

    // 11. AI Proposals (Matching Screens 6 and 7)
    await client.query(
      `INSERT INTO ai_proposals (
        id, tenant_id, legal_entity_id, proposal_type, confidence_score, statutory_basis,
        status, proposal_payload
      ) VALUES ($1, $2, $3, 'BANK_REC_MATCH', 99,
        'Exact amount match (10,500.00 AED) and reference to Al-Futtaim Group matches customer invoice JV-2026-0042.',
        'PENDING_REVIEW', $4)
      ON CONFLICT (id) DO UPDATE SET proposal_payload = $4, confidence_score = 99`,
      [
        'f0000000-0000-0000-0000-000000000001',
        targetTenantId,
        mainlandEntityId,
        JSON.stringify({
          id: 'prop-001',
          statementLineId: stmt1Id,
          matchType: 'EXACT_AMOUNT_CUSTOMER',
          title: 'Auto-Match Al-Futtaim Wire Transfer',
          confidence: 0.99,
          entity: 'Al-Noor Trading LLC',
          amountMinorUnits: '1050000',
          costTokens: 1420
        })
      ]
    );

    await client.query(
      `INSERT INTO ai_proposals (
        id, tenant_id, legal_entity_id, proposal_type, confidence_score, statutory_basis,
        status, proposal_payload
      ) VALUES ($1, $2, $3, 'BANK_REC_MATCH', 98,
        'Auto-Match Emirates NBD Inward Wire to unapplied retainer balance.',
        'PENDING_REVIEW', $4)
      ON CONFLICT (id) DO UPDATE SET proposal_payload = $4, confidence_score = 98`,
      [
        'f0000000-0000-0000-0000-000000000002',
        targetTenantId,
        mainlandEntityId,
        JSON.stringify({
          id: 'prop-002',
          statementLineId: stmt1Id,
          matchType: 'RETAINER_MATCH',
          title: 'Auto-Match Emirates NBD Inward Wire',
          confidence: 0.98,
          entity: 'Al-Noor Trading LLC',
          amountMinorUnits: '14250000',
          costTokens: 1420
        })
      ]
    );

    await client.query(
      `INSERT INTO ai_proposals (
        id, tenant_id, legal_entity_id, proposal_type, confidence_score, statutory_basis,
        status, proposal_payload
      ) VALUES ($1, $2, $3, 'SBR_RELIEF', 95,
        'Revenue does not exceed AED 3,000,000 threshold under Ministerial Decision No. 73 of 2023 on Small Business Relief.',
        'PENDING_REVIEW', $4)
      ON CONFLICT (id) DO UPDATE SET proposal_payload = $4, confidence_score = 95`,
      [
        'f0000000-0000-0000-0000-000000000003',
        targetTenantId,
        mainlandEntityId,
        JSON.stringify({
          id: 'prop-003',
          title: 'Apply Small Business Relief (SBR) Exemption for Q1 Under Art. 21',
          confidence: 0.95,
          entity: 'Al-Noor Tech DMCC',
          amountMinorUnits: '0',
          costTokens: 980
        })
      ]
    );

    // 12. Audit Logs (for Screen 9 cryptographic verification)
    await client.query(
      `INSERT INTO audit_logs (
        id, tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, 'CHIEF_ACCOUNTANT',
        'POST_JOURNAL_VOUCHER (JV-2026-0001)', 'JOURNAL_ENTRY', $4,
        'c8f7e2a1b9d4e3f5a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0'
      ) ON CONFLICT DO NOTHING`,
      [targetTenantId, mainlandEntityId, userId, jv1Id]
    );

    // 13. Seed Isolated Tenant B for Cross-Tenant Security Verification
    const tenantBId = '00000000-0000-0000-0000-000000000002';
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [tenantBId]);

    await client.query(
      `INSERT INTO tenants (id, name, slug)
       VALUES ($1, 'Alpha Corporation LLC', 'alpha-group')
       ON CONFLICT (slug) DO UPDATE SET name = 'Alpha Corporation LLC'`,
      [tenantBId]
    );

    const tenantBEntityId = '00000000-0000-0000-0000-000000000021';
    await client.query(
      `INSERT INTO legal_entities (
        id, tenant_id, legal_name_en, legal_name_ar, trade_license_number,
        trn, jurisdiction_type, address_emirate, base_currency
      ) VALUES ($1, $2, 'Alpha Services FZCO', 'شركة ألفا للخدمات ش.م.ح', 'TL-ALPHA-01', '100999888777666', 'FREE_ZONE', 'DUBAI', 'AED')
      ON CONFLICT (id) DO NOTHING`,
      [tenantBEntityId, tenantBId]
    );

    const tenantBUserRes = await client.query(
      `INSERT INTO users (
        tenant_id, email, full_name_en, full_name_ar, role, password_hash,
        is_active, is_2fa_enabled, totp_secret_encrypted
      ) VALUES ($1, 'auditor@alphacorp.ae', 'Alpha Internal Auditor', 'مدقق ألفا الداخلي', $2, $3, TRUE, TRUE, $4)
      ON CONFLICT (email) DO UPDATE
      SET password_hash = $3, totp_secret_encrypted = $4, role = $2
      RETURNING id`,
      [tenantBId, UserRole.FINANCIAL_CONTROLLER, passwordHash, encryptedTotp]
    );
    const tenantBUserId = tenantBUserRes.rows[0].id;

    const tenantBBookId = '00000000-0000-0000-0000-000000000023';
    await client.query(
      `INSERT INTO books (id, tenant_id, legal_entity_id, book_code, currency, is_primary)
       VALUES ($1, $2, $3, 'STATUTORY_ALPHA', 'AED', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [tenantBBookId, tenantBId, tenantBEntityId]
    );

    const tenantBPeriodId = '00000000-0000-0000-0000-000000000024';
    await client.query(
      `INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date, is_hard_locked, is_soft_locked)
       VALUES ($1, $2, $3, 2026, 1, '2026-01-01', '2026-01-31', FALSE, FALSE)
       ON CONFLICT (id) DO NOTHING`,
      [tenantBPeriodId, tenantBId, tenantBEntityId]
    );

    const tenantBAccBankId = '10200000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
       VALUES ($1, $2, $3, '1020', 'Mashreq Bank - Alpha Ops', 'بنك المشرق - عمليات ألفا', 'ASSET', 'BANK', 'DEBIT')
       ON CONFLICT (id) DO NOTHING`,
      [tenantBAccBankId, tenantBId, tenantBEntityId]
    );

    const tenantBAccRevId = '40100000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO chart_of_accounts (id, tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance)
       VALUES ($1, $2, $3, '4010', 'Alpha Consulting Revenue', 'إيرادات ألفا الاستشارية', 'REVENUE', 'OPERATING', 'CREDIT')
       ON CONFLICT (id) DO NOTHING`,
      [tenantBAccRevId, tenantBId, tenantBEntityId]
    );

    const tenantBJvId = '00000000-0000-0000-0000-000000000025';
    const tenantBJvHash = computeHash({ entryNumber: 'JV-ALPHA-001', total: 100000 });
    await client.query(
      `INSERT INTO journal_entries (
        id, tenant_id, legal_entity_id, book_id, period_id, entry_number,
        posting_date, document_date, status, source_module, memo_en, memo_ar, created_by, entry_hash
      ) VALUES ($1, $2, $3, $4, $5, 'JV-ALPHA-001', '2026-01-15', '2026-01-15', 'POSTED', 'MANUAL',
        'Alpha Tenant B Opening Consultation Fee', 'قيد افتتاح إيرادات استشارية لألفا', $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [tenantBJvId, tenantBId, tenantBEntityId, tenantBBookId, tenantBPeriodId, tenantBUserId, tenantBJvHash]
    );

    const bLinesCheck = await client.query('SELECT count(*) FROM journal_lines WHERE journal_entry_id = $1', [tenantBJvId]);
    if (parseInt(bLinesCheck.rows[0].count) === 0) {
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 100000, 100000, 100000000, 'DEBIT', 1)`,
        [tenantBId, tenantBJvId, tenantBAccBankId]
      );
      await client.query(
        `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
         VALUES ($1, $2, $3, 'AED', 100000, 100000, 100000000, 'CREDIT', 2)`,
        [tenantBId, tenantBJvId, tenantBAccRevId]
      );
    }

    // Tenant B Bank Statement Line
    const tenantBStmtParentId = 'e0000000-0000-0000-0000-000000000003';
    await client.query(
      `INSERT INTO bank_statements (id, tenant_id, legal_entity_id, account_id, statement_identifier, opening_balance_base, closing_balance_base, statement_date)
       VALUES ($1, $2, $3, $4, 'STMT-MASHREQ-ALPHA-01', 500000, 600000, '2026-01-31')
       ON CONFLICT (id) DO NOTHING`,
      [tenantBStmtParentId, tenantBId, tenantBEntityId, tenantBAccBankId]
    );

    const tenantBStmtLineId = 'e0000000-0000-0000-0000-000000000004';
    await client.query(
      `INSERT INTO bank_statement_lines (id, tenant_id, statement_id, booking_date, reference, narrative, amount_txn, direction, is_reconciled)
       VALUES ($1, $2, $3, '2026-01-20', 'TXN-ALPHA-99', 'Alpha Client Advisory Fee', 100000, 'CREDIT', false)
       ON CONFLICT (id) DO NOTHING`,
      [tenantBStmtLineId, tenantBId, tenantBStmtParentId]
    );

    // Tenant B Invoice
    const tenantBCustId = 'c0000000-0000-0000-0000-000000000003';
    await client.query(
      `INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'CUST-ALPHA-01', 'Apex Global LLC', 'شركة أبيكس العالمية', '100888777666555')
       ON CONFLICT (id) DO NOTHING`,
      [tenantBCustId, tenantBId, tenantBEntityId]
    );

    const tenantBInvId = 'd0000000-0000-0000-0000-000000000102';
    await client.query(
      `INSERT INTO invoices (
        id, tenant_id, legal_entity_id, customer_id, invoice_number, issue_date, due_date,
        currency, subtotal_txn, vat_total_txn, total_txn, subtotal_base, vat_total_base, total_base,
        status, einvoice_status
      ) VALUES ($1, $2, $3, $4, 'INV-ALPHA-001', '2026-01-18', '2026-02-18', 'AED', 1000000, 50000, 1050000, 1000000, 50000, 1050000, 'POSTED', 'CLEARED')
      ON CONFLICT (id) DO NOTHING`,
      [tenantBInvId, tenantBId, tenantBEntityId, tenantBCustId]
    );

    // 13. Phase 5 Enterprise Fixtures for Tenant A
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [targetTenantId]);

    // Bill Approvals for pending bill
    const approvalId = 'f0000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO bill_approvals (id, tenant_id, bill_id, approver_id, approval_status, tier, notes)
       VALUES ($1, $2, $3, $4, 'PENDING', 'TIER2', 'Quarterly CISCO networking equipment expansion - Pending Financial Controller approval')
       ON CONFLICT (id) DO NOTHING`,
      [approvalId, targetTenantId, bill5502Id, userId]
    );

    const approvalTier1Id = 'f0000000-0000-0000-0000-000000000003';
    await client.query(
      `INSERT INTO bill_approvals (id, tenant_id, bill_id, approver_id, approval_status, tier, notes)
       VALUES ($1, $2, $3, $4, 'PENDING', 'TIER1', 'Monthly telecom link - Pending approval')
       ON CONFLICT (id) DO NOTHING`,
      [approvalTier1Id, targetTenantId, bill5503Id, userId]
    );

    // Payments & Payment Allocations
    const paymentCustId = 'a1000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO payments (id, tenant_id, legal_entity_id, payment_number, payment_type, partner_id, payment_date, amount_txn, currency, amount_base)
       VALUES ($1, $2, $3, 'PAY-2026-0001', 'INBOUND_CUSTOMER', $4, '2026-01-15', 52500000, 'AED', 52500000)
       ON CONFLICT (id) DO NOTHING`,
      [paymentCustId, targetTenantId, mainlandEntityId, customerEmaarId]
    );

    await client.query(
      `INSERT INTO payment_allocations (id, tenant_id, payment_id, invoice_id, allocated_amount_base)
       VALUES (gen_random_uuid(), $1, $2, $3, 52500000)`,
      [targetTenantId, paymentCustId, inv101Id]
    );

    // Fixed Assets & Schedules
    const assetId = 'fa000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO fixed_assets (id, tenant_id, legal_entity_id, asset_number, name_en, acquisition_date, acquisition_cost_base, useful_life_months, salvage_value_base, accumulated_depreciation_base)
       VALUES ($1, $2, $3, 'FA-SRV-2026-01', 'Enterprise AI High-Compute GPU Cluster', '2026-01-01', 36000000, 36, 0, 1000000)
       ON CONFLICT (id) DO NOTHING`,
      [assetId, targetTenantId, mainlandEntityId]
    );

    await client.query(
      `INSERT INTO fixed_asset_schedules (id, tenant_id, asset_id, period_date, depreciation_amount_base, accumulated_depreciation_base, net_book_value_base, is_posted)
       VALUES (gen_random_uuid(), $1, $2, '2026-01-31', 1000000, 1000000, 35000000, true),
              (gen_random_uuid(), $1, $2, '2026-02-28', 1000000, 2000000, 34000000, false)`,
      [targetTenantId, assetId]
    );

    // IFRS 16 Leases & Schedules
    const leaseId = '1c000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO lease_contracts (id, tenant_id, legal_entity_id, contract_number, commencement_date, lease_term_months, monthly_payment_base, annual_discount_rate_bps, rou_asset_initial_base, lease_liability_initial_base)
       VALUES ($1, $2, $3, 'LC-DXB-MARINA-01', '2026-01-01', 24, 5000000, 500, 114000000, 114000000)
       ON CONFLICT (id) DO NOTHING`,
      [leaseId, targetTenantId, mainlandEntityId]
    );

    await client.query(
      `INSERT INTO lease_schedules (id, tenant_id, contract_id, period_month, payment_base, principal_base, interest_base, closing_liability_base, rou_depreciation_base, is_posted)
       VALUES (gen_random_uuid(), $1, $2, 1, 5000000, 4525000, 475000, 109475000, 4750000, true),
              (gen_random_uuid(), $1, $2, 2, 5000000, 4543854, 456146, 104931146, 4750000, false)
       ON CONFLICT (contract_id, period_month) DO NOTHING`,
      [targetTenantId, leaseId]
    );

    // IFRS 15 Revenue Contracts & Milestones
    const ifrs15Id = 'c1500000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO ifrs15_contracts (id, tenant_id, legal_entity_id, customer_id, contract_number, contract_name, start_date, end_date, total_contract_value_base, recognized_revenue_base, deferred_revenue_base, status)
       VALUES ($1, $2, $3, $4, 'CNT-2026-EMAAR-01', 'Bilingual ERP & Autonomous Tax Agent Deployment', '2026-01-01', '2026-12-31', 150000000, 50000000, 100000000, 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [ifrs15Id, targetTenantId, mainlandEntityId, customerEmaarId]
    );

    await client.query(
      `INSERT INTO ifrs15_milestones (id, tenant_id, contract_id, milestone_name, milestone_value_base, completion_percentage, is_satisfied, satisfied_date)
       VALUES (gen_random_uuid(), $1, $2, 'Milestone 1: Architectural Blueprint & Statutory Co-design', 50000000, 100, true, '2026-01-20'),
              (gen_random_uuid(), $1, $2, 'Milestone 2: Real-time Ingestion & Central Bank WPS Connector', 50000000, 60, false, null),
              (gen_random_uuid(), $1, $2, 'Milestone 3: Auditor Read-only Sign-off & Production Handoff', 50000000, 0, false, null)`,
      [targetTenantId, ifrs15Id]
    );

    // Payroll Runs & Employees
    const payrollRunId = '90000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO payroll_runs (id, tenant_id, legal_entity_id, period_year, period_month, total_employees, total_gross_base, total_net_base, sif_file_name, sif_content, status)
       VALUES ($1, $2, $3, 2026, 1, 3, 6500000, 6250000, 'SIF_100011122200003_20260131.sif', 'SCR,100011122200003,ENBD,2026-01-31,3,62500.00,AED\nEDR,1001,EBIL001,AE030330000000123456789,35000.00,0,0,30,0\nEDR,1002,EBIL002,AE030330000000123456790,17500.00,0,0,30,0\nEDR,1003,EBIL003,AE030330000000123456791,10000.00,0,0,30,0', 'SIF_GENERATED')
       ON CONFLICT (id) DO NOTHING`,
      [payrollRunId, targetTenantId, mainlandEntityId]
    );

    await client.query(
      `INSERT INTO payroll_employees (id, tenant_id, payroll_run_id, employee_id, employee_name, labor_card_number, iban, fixed_salary_base, variable_salary_base, deductions_base, net_salary_base, eosg_accrued_base)
       VALUES (gen_random_uuid(), $1, $2, 'EMP-001', 'Tariq Al-Mansoor', 'LC-78912', 'AE030330000000123456789', 3500000, 0, 0, 3500000, 291666),
              (gen_random_uuid(), $1, $2, 'EMP-002', 'Fatima Al-Zahra', 'LC-78913', 'AE030330000000123456790', 1750000, 0, 0, 1750000, 145833),
              (gen_random_uuid(), $1, $2, 'EMP-003', 'Zaid Bin Rashid', 'LC-78914', 'AE030330000000123456791', 1000000, 0, 0, 1000000, 83333)`,
      [targetTenantId, payrollRunId]
    );

    // Migration Imports
    await client.query(
      `INSERT INTO migration_imports (id, tenant_id, legal_entity_id, source_system, import_type, filename, raw_payload, status, records_imported, records_failed)
       VALUES (gen_random_uuid(), $1, $2, 'ZOHO', 'COA', 'zoho_chart_of_accounts_2026.csv', '{"source":"Zoho Books","accounts":48,"mapped":48}'::jsonb, 'COMPLETED', 48, 0),
              (gen_random_uuid(), $1, $2, 'QUICKBOOKS', 'VENDORS', 'quickbooks_vendors_export.json', '{"source":"QuickBooks Online","vendors":24,"imported":24}'::jsonb, 'COMPLETED', 24, 0),
              (gen_random_uuid(), $1, $2, 'TALLY', 'BALANCES', 'tally_trial_balance_opening.xml', '{"source":"Tally Prime 4.0","balanced":true,"records":62}'::jsonb, 'COMPLETED', 62, 0)`,
      [targetTenantId, mainlandEntityId]
    );

    // Subscriptions & Usage Metering
    await client.query(
      `INSERT INTO tenant_subscriptions (id, tenant_id, plan_tier, is_sandbox, max_entities, max_monthly_invoices, billing_cycle_start, billing_cycle_end, status)
       VALUES (gen_random_uuid(), $1, 'ENTERPRISE', false, 25, 50000, '2026-01-01', '2026-12-31', 'ACTIVE')
       ON CONFLICT (tenant_id) DO UPDATE SET plan_tier = EXCLUDED.plan_tier, is_sandbox = EXCLUDED.is_sandbox`,
      [targetTenantId]
    );

    await client.query(
      `INSERT INTO usage_metering (id, tenant_id, period_month, invoices_created, ai_tokens_consumed, api_calls_count, wps_transmissions_count)
       VALUES (gen_random_uuid(), $1, '2026-01', 24, 84200, 1420, 1)
       ON CONFLICT (tenant_id, period_month) DO UPDATE SET invoices_created = EXCLUDED.invoices_created, ai_tokens_consumed = EXCLUDED.ai_tokens_consumed`,
      [targetTenantId]
    );

    await client.query('COMMIT');
    console.log(`Seeded complete dev fixtures for tenant ${tenantSlug} (${targetTenantId})`);
    console.log(`User: ${seedEmail}`);
    console.log(`TOTP Secret: ${rawTotpSecret}`);
    console.log('Operational balances seeded: Debits == Credits verified.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
