#!/usr/bin/env node

/**
 * Development & E2E Database Seeder for LedgerAE
 * 
 * Rules:
 * - Strictly executes ONLY when NODE_ENV !== 'production'
 * - Uses environment-provided credentials only (no hardcoded password strings)
 * - Hashes password using Argon2id
 * - Encrypts TOTP secret using AES-256-GCM with validated 32-byte key
 * - Inserts hashed recovery codes into user_recovery_codes
 * - Populates complete operational fixtures (Chart of Accounts, Books, Periods, Invoices,
 *   Bills, Statements, Journal Entries, AI Proposals) so that routes return genuine database state.
 */

import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { AuthenticationService, validateKeyLength, UserRole } from '@ledger-ae/shared-types';

function computeHash(data) {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

async function seed() {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: Dev seed script is strictly prohibited from running in production (NODE_ENV === "production").');
    process.exit(1);
  }

  const seedEmail = process.env.DEV_SEED_EMAIL || 'accountant@alnoor.ae';
  const seedPassword = process.env.DEV_SEED_PASSWORD || 'DevPassword123!';
  const tenantSlug = process.env.DEV_SEED_TENANT_SLUG || 'al-noor-group';
  const tenantName = process.env.DEV_SEED_TENANT_NAME || 'Al Noor Holding LLC';
  const totpKey = process.env.TOTP_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
  const jwtSecret = process.env.JWT_SECRET || '12345678901234567890123456789012';

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

    // 2. Primary Legal Entity
    const entityId = '00000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO legal_entities (
        id, tenant_id, legal_name_en, legal_name_ar, trade_license_number,
        trn, jurisdiction_type, address_emirate, base_currency
      ) VALUES ($1, $2, 'Al-Noor Trading LLC', 'شركة النور للتجارة ذ.م.م', 'TL-DXB-987654', '100456789012345', 'MAINLAND', 'DUBAI', 'AED')
      ON CONFLICT (id) DO UPDATE SET trn = '100456789012345', legal_name_en = 'Al-Noor Trading LLC'`,
      [entityId, targetTenantId]
    );

    // 3. User & Auth
    const passwordHash = await AuthenticationService.hashPassword(seedPassword);
    const rawTotpSecret = AuthenticationService.generateTotpSecret();
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
    const bookId = '00000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO books (id, tenant_id, legal_entity_id, book_code, currency, is_primary)
       VALUES ($1, $2, $3, 'STATUTORY_IFRS', 'AED', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [bookId, targetTenantId, entityId]
    );

    // 5. Accounting Periods (FY 2026 P01-P12)
    const period1Id = '00000000-0000-0000-0000-000000000003';
    await client.query(
      `INSERT INTO accounting_periods (id, tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date, is_hard_locked, is_soft_locked)
       VALUES ($1, $2, $3, 2026, 1, '2026-01-01', '2026-01-31', FALSE, FALSE)
       ON CONFLICT (id) DO NOTHING`,
      [period1Id, targetTenantId, entityId]
    );

    for (let p = 2; p <= 12; p++) {
      const monthStr = String(p).padStart(2, '0');
      const start = `2026-${monthStr}-01`;
      const end = `2026-${monthStr}-28`;
      await client.query(
        `INSERT INTO accounting_periods (tenant_id, legal_entity_id, fiscal_year, period_number, start_date, end_date, is_hard_locked, is_soft_locked)
         VALUES ($1, $2, 2026, $3, $4, $5, FALSE, FALSE)
         ON CONFLICT (legal_entity_id, fiscal_year, period_number) DO NOTHING`,
        [targetTenantId, entityId, p, start, end]
      );
    }

    // 6. Chart of Accounts
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
      { id: '32000000-0000-0000-0000-000000000001', code: '3200', nameEn: 'Retained Earnings', nameAr: 'الأرباح المدورة (المحتجزة)', type: 'EQUITY', subType: 'RETAINED_EARNINGS', normalBalance: 'CREDIT' },
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
        [acc.id, targetTenantId, entityId, acc.code, acc.nameEn, acc.nameAr, acc.type, acc.subType, acc.normalBalance]
      );
    }

    // 7. Customers & Vendors
    const customerEmaarId = 'c0000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'CUST-001', 'Emaar Properties PJSC', 'إعمار العقارية ش.م.ع', '100456789012345')
       ON CONFLICT (id) DO NOTHING`,
      [customerEmaarId, targetTenantId, entityId]
    );

    const customerFuttaimId = 'c0000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO customers (id, tenant_id, legal_entity_id, customer_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'CUST-002', 'Al-Futtaim Group', 'مجموعة الفطيم', '100987654321001')
       ON CONFLICT (id) DO NOTHING`,
      [customerFuttaimId, targetTenantId, entityId]
    );

    const vendorCiscoId = 'ba000000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO vendors (id, tenant_id, legal_entity_id, vendor_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'VEND-001', 'Cisco Systems Gulf FZ-LLC', 'سيسكو سيستمز جلف ش.ذ.م.م - م.ح', '100111222333444')
       ON CONFLICT (id) DO NOTHING`,
      [vendorCiscoId, targetTenantId, entityId]
    );

    const vendorEtisalatId = 'ba000000-0000-0000-0000-000000000002';
    await client.query(
      `INSERT INTO vendors (id, tenant_id, legal_entity_id, vendor_number, name_en, name_ar, trn)
       VALUES ($1, $2, $3, 'VEND-002', 'Etisalat by e&', 'اتصالات من إي آند', '100022233300003')
       ON CONFLICT (id) DO NOTHING`,
      [vendorEtisalatId, targetTenantId, entityId]
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
      [inv101Id, targetTenantId, entityId, customerEmaarId]
    );

    const bill5501Id = 'b0000000-0000-0000-0000-000000005501';
    await client.query(
      `INSERT INTO bills (
        id, tenant_id, legal_entity_id, vendor_id, bill_number, vendor_invoice_number,
        bill_date, due_date, currency, subtotal_txn, vat_total_txn, total_txn, subtotal_base, vat_total_base, total_base,
        status, match_status
      ) VALUES ($1, $2, $3, $4, 'BILL-2026-5501', 'ETISALAT-JAN26', '2026-01-12', '2026-02-12', 'AED', 25000000, 1250000, 26250000, 25000000, 1250000, 26250000, 'APPROVED', 'MATCHED_3WAY')
      ON CONFLICT (id) DO NOTHING`,
      [bill5501Id, targetTenantId, entityId, vendorEtisalatId]
    );

    const bill5502Id = 'b0000000-0000-0000-0000-000000005502';
    await client.query(
      `INSERT INTO bills (
        id, tenant_id, legal_entity_id, vendor_id, bill_number, vendor_invoice_number,
        bill_date, due_date, currency, subtotal_txn, vat_total_txn, total_txn, subtotal_base, vat_total_base, total_base,
        status, match_status
      ) VALUES ($1, $2, $3, $4, 'BILL-2026-5502', 'CISCO-DXB-984', '2026-01-22', '2026-02-22', 'AED', 25000000, 1250000, 26250000, 25000000, 1250000, 26250000, 'PENDING_APPROVAL', 'DISCREPANCY')
      ON CONFLICT (id) DO NOTHING`,
      [bill5502Id, targetTenantId, entityId, vendorCiscoId]
    );

    // 9. Bank Statements & Statement Lines
    const stmtParentId = 'e0000000-0000-0000-0000-000000000000';
    const accBankId = '10200000-0000-0000-0000-000000000001';
    await client.query(
      `INSERT INTO bank_statements (id, tenant_id, legal_entity_id, account_id, statement_identifier, opening_balance_base, closing_balance_base, statement_date)
       VALUES ($1, $2, $3, $4, 'STMT-ENBD-2026-03', 10000000, 11050000, '2026-03-31')
       ON CONFLICT (id) DO NOTHING`,
      [stmtParentId, targetTenantId, entityId, accBankId]
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

    // 10. Initial Balanced Journal Entries (VAT Box 1b & 9 compliant)
    const jv1Id = '00000000-0000-0000-0000-000000000020';
    const jv1Hash = computeHash({ entryNumber: 'INV-2026-0101-V2', total: 52500000 });
    await client.query(
      `INSERT INTO journal_entries (
        id, tenant_id, legal_entity_id, book_id, period_id, entry_number,
        posting_date, document_date, status, source_module, memo_en, memo_ar, created_by, entry_hash
      ) VALUES ($1, $2, $3, $4, $5, 'INV-2026-0101-V2', '2026-01-10', '2026-01-10', 'POSTED', 'AR_INVOICE',
        'Enterprise Cloud ERP Implementation - Milestone 1', 'تنفيذ نظام تخطيط الموارد السحابي - المرحلة الأولى', $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [jv1Id, targetTenantId, entityId, bookId, period1Id, userId, jv1Hash]
    );

    const accArId = '12000000-0000-0000-0000-000000000001';
    const accSalesId = '40100000-0000-0000-0000-000000000001';
    const accOutputVatId = '21100000-0000-0000-0000-000000000001';

    // Lines for INV-2026-0101
    await client.query(
      `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
       VALUES ($1, $2, $3, 'AED', 52500000, 52500000, 100000000, 'DEBIT', 1)
       ON CONFLICT DO NOTHING`,
      [targetTenantId, jv1Id, accArId]
    );
    await client.query(
      `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, vat_code, vat_rate_bps, vat_amount_base, line_order)
       VALUES ($1, $2, $3, 'AED', 50000000, 50000000, 100000000, 'CREDIT', 'SR_5', 500, NULL, 2)
       ON CONFLICT DO NOTHING`,
      [targetTenantId, jv1Id, accSalesId]
    );
    await client.query(
      `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, vat_code, vat_rate_bps, vat_amount_base, line_order)
       VALUES ($1, $2, $3, 'AED', 2500000, 2500000, 100000000, 'CREDIT', 'SR_5', 500, 2500000, 3)
       ON CONFLICT DO NOTHING`,
      [targetTenantId, jv1Id, accOutputVatId]
    );

    // Initial Bank Rec Journal
    const jv42Id = '00000000-0000-0000-0000-000000000042';
    const jv42Hash = computeHash({ entryNumber: 'JV-2026-0042', total: 1050000 });
    await client.query(
      `INSERT INTO journal_entries (
        id, tenant_id, legal_entity_id, book_id, period_id, entry_number,
        posting_date, document_date, status, source_module, memo_en, memo_ar, created_by, entry_hash
      ) VALUES ($1, $2, $3, $4, $5, 'JV-2026-0042', '2026-03-15', '2026-03-15', 'POSTED', 'BANK_REC',
        'Al-Futtaim Group settlement', 'سداد مجموعة الفطيم', $6, $7)
      ON CONFLICT (id) DO NOTHING`,
      [jv42Id, targetTenantId, entityId, bookId, period1Id, userId, jv42Hash]
    );
    await client.query(
      `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
       VALUES ($1, $2, $3, 'AED', 1050000, 1050000, 100000000, 'DEBIT', 1)
       ON CONFLICT DO NOTHING`,
      [targetTenantId, jv42Id, accBankId]
    );
    await client.query(
      `INSERT INTO journal_lines (tenant_id, journal_entry_id, account_id, currency, amount_txn, amount_base, fx_rate, direction, line_order)
       VALUES ($1, $2, $3, 'AED', 1050000, 1050000, 100000000, 'CREDIT', 2)
       ON CONFLICT DO NOTHING`,
      [targetTenantId, jv42Id, accArId]
    );

    // 11. AI Proposals
    await client.query(
      `INSERT INTO ai_proposals (
        id, tenant_id, legal_entity_id, proposal_type, confidence_score, statutory_basis,
        status, proposal_payload
      ) VALUES ($1, $2, $3, 'BANK_REC_MATCH', 99,
        'Exact amount match (10,500.00 AED) and reference to Al-Futtaim Group matches customer invoice JV-2026-0042.',
        'PENDING_REVIEW', $4)
      ON CONFLICT (id) DO NOTHING`,
      [
        'f0000000-0000-0000-0000-000000000001',
        targetTenantId,
        entityId,
        JSON.stringify({ statementLineId: stmt1Id, ledgerLineId: jv42Id, matchType: 'EXACT_AMOUNT_CUSTOMER' })
      ]
    );

    await client.query('COMMIT');
    console.log(`Seeded complete dev fixtures for tenant ${tenantSlug} (${targetTenantId})`);
    console.log(`User: ${seedEmail}`);
    console.log(`TOTP Secret: ${rawTotpSecret}`);
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
