# LedgerAE: Core Domain Model & Entity Relationships

```mermaid
erDiagram
    TENANT ||--o{ LEGAL_ENTITY : owns
    TENANT ||--o{ USER : manages
    LEGAL_ENTITY ||--o{ FISCAL_YEAR : defines
    FISCAL_YEAR ||--o{ ACCOUNTING_PERIOD : contains
    LEGAL_ENTITY ||--o{ CHART_OF_ACCOUNTS : maintains
    CHART_OF_ACCOUNTS ||--o{ ACCOUNT : includes
    
    LEGAL_ENTITY ||--o{ JOURNAL_ENTRY : records
    JOURNAL_ENTRY ||--|{ JOURNAL_LINE : contains
    ACCOUNT ||--o{ JOURNAL_LINE : classifies
    
    LEGAL_ENTITY ||--o{ BOOK : configures
    JOURNAL_ENTRY }|--|| BOOK : targets
    
    LEGAL_ENTITY ||--o{ CUSTOMER : sells_to
    LEGAL_ENTITY ||--o{ VENDOR : purchases_from
    
    CUSTOMER ||--o{ INVOICE : billed
    INVOICE ||--|{ INVOICE_LINE : contains
    INVOICE ||--o{ E_INVOICE_TRANSMISSION : generates
    
    VENDOR ||--o{ PURCHASE_ORDER : orders
    PURCHASE_ORDER ||--o{ GOODS_RECEIPT : receives
    VENDOR ||--o{ BILL : bills
    BILL ||--|{ BILL_LINE : contains
    
    LEGAL_ENTITY ||--o{ BANK_ACCOUNT : operates
    BANK_ACCOUNT ||--o{ BANK_STATEMENT : imports
    BANK_STATEMENT ||--|{ STATEMENT_LINE : contains
    STATEMENT_LINE ||--o{ RECONCILIATION_MATCH : reconciles
    JOURNAL_LINE ||--o{ RECONCILIATION_MATCH : balances
    
    ACCOUNTING_PERIOD ||--o{ CLOSE_TASK : tracks
    CLOSE_TASK ||--o{ CLOSE_EVIDENCE : documents
    
    TENANT ||--o{ AUDIT_LOG : tracks_everything
    JOURNAL_ENTRY ||--o{ AUDIT_LOG : referenced_by

    TENANT {
        uuid id PK
        string name
        string slug
        string default_country "AE"
        string residency_region "me-central-1"
        datetime created_at
    }

    LEGAL_ENTITY {
        uuid id PK
        uuid tenant_id FK
        string legal_name_en
        string legal_name_ar
        string trade_license_number
        string trn "15-digit UAE TRN"
        string corporate_tax_trn
        string jurisdiction_type "MAINLAND | FREE_ZONE | FINANCIAL_FREE_ZONE"
        string free_zone_name "e.g. DMCC, DIFC, ADGM"
        boolean is_qualifying_free_zone_person
        string base_currency "AED"
        string address_emirate "DUBAI | ABU_DHABI | SHARJAH | etc."
    }

    BOOK {
        uuid id PK
        uuid legal_entity_id FK
        string book_code "STATUTORY_IFRS | UAE_TAX | MANAGEMENT"
        string currency "AED"
        boolean is_primary
    }

    ACCOUNT {
        uuid id PK
        uuid legal_entity_id FK
        string code "e.g. 10100"
        string name_en
        string name_ar
        string type "ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE"
        string sub_type "CURRENT_ASSET | OPERATING_EXPENSE | etc."
        string normal_balance "DEBIT | CREDIT"
        boolean is_reconciliation_account
        boolean is_active
    }

    JOURNAL_ENTRY {
        uuid id PK
        uuid tenant_id FK
        uuid legal_entity_id FK
        uuid book_id FK
        string entry_number "VOUCHER-2026-00001"
        date posting_date
        date document_date
        string status "DRAFT | POSTED | REVERSED"
        string source_module "MANUAL | AR_INVOICE | AP_BILL | BANK_REC | REVENUE_REC | AI_ACCRUAL"
        uuid source_id
        string memo_en
        string memo_ar
        uuid created_by FK
        datetime posted_at
    }

    JOURNAL_LINE {
        uuid id PK
        uuid journal_entry_id FK
        uuid account_id FK
        string currency "ISO-4217"
        bigint amount_txn "Integer minor units in txn currency"
        bigint amount_base "Integer minor units in base AED"
        bigint fx_rate "Scaled integer 10^8"
        string direction "DEBIT | CREDIT"
        string vat_code "STANDARD_5 | ZERO_0 | EXEMPT | OUT_OF_SCOPE | RCM_5"
        bigint vat_rate_bps "500 for 5.00%"
        bigint vat_amount_base
        uuid dimension_project_id
        uuid dimension_cost_center_id
        uuid dimension_location_id
    }

    INVOICE {
        uuid id PK
        uuid legal_entity_id FK
        uuid customer_id FK
        string invoice_number
        date issue_date
        date due_date
        string currency
        bigint subtotal_base
        bigint vat_total_base
        bigint total_base
        string status "DRAFT | ISSUED | PAID | CANCELLED"
        string einvoice_status "PENDING | TRANSMITTED | CLEARED | REJECTED"
        string peppol_uuid
    }

    BILL {
        uuid id PK
        uuid legal_entity_id FK
        uuid vendor_id FK
        string bill_number
        string vendor_trn
        date bill_date
        date due_date
        string currency
        bigint subtotal_base
        bigint vat_total_base
        bigint total_base
        string match_status "PENDING | TWO_WAY | THREE_WAY_MATCHED | EXCEPTION"
        string status "DRAFT | APPROVED | POSTED | PAID"
    }

    CLOSE_TASK {
        uuid id PK
        uuid period_id FK
        string title
        string category "BANK_REC | AR_SUBLEDGER | AP_SUBLEDGER | ACCRUALS | TAX_VAT | CONSOLIDATION"
        string status "NOT_STARTED | IN_PROGRESS | AI_VERIFIED | COMPLETED | WAITING_APPROVAL"
        uuid assignee_id FK
        datetime due_date
        boolean auto_completable_by_ai
    }
```

---

## 1. Monetary Unit and Arithmetic Domain Rule

```typescript
export interface Money {
  /** Amount in minor units, e.g. 100.50 AED is stored as 10050n */
  amount: bigint;
  /** ISO-4217 Currency Code, e.g. 'AED', 'USD' */
  currency: string;
  /** Currency scale factor / decimals, AED = 2, JPY = 0, KWD = 3 */
  decimals: number;
}

export interface FxRate {
  baseCurrency: string;     // 'AED'
  quoteCurrency: string;    // 'USD'
  /** Scaled integer: e.g. 3.67250000 stored as 367250000n with scale 10^8 */
  rate: bigint;
  rateScale: bigint;        // 100000000n
}
```

## 2. UAE VAT Code Tax Classification Model

```typescript
export enum UaeVatTaxCode {
  STANDARD_RATED_5 = 'SR_5',       // 5% standard rated supply
  ZERO_RATED_EXPORTS_0 = 'ZR_EXP_0', // 0% exported goods/services outside GCC
  ZERO_RATED_LOCAL_0 = 'ZR_LOC_0',   // 0% local qualifying (healthcare, education, local transport)
  EXEMPT_FINANCIAL = 'EX_FIN',      // Exempt financial services (margin-based)
  EXEMPT_RESIDENTIAL = 'EX_RES',    // Exempt residential real estate leases
  OUT_OF_SCOPE = 'OOS',             // Outside territorial scope of UAE VAT
  REVERSE_CHARGE_5 = 'RCM_5',       // Art. 48 reverse charge mechanism on imported goods/services
  DESIGNATED_ZONE_GOODS = 'DZ_GOODS'// Transfers within/between designated free zones
}
```

## 3. UAE Corporate Tax (CT) Model

```typescript
export interface CorporateTaxAssessment {
  entityId: string;
  taxPeriodYear: number;
  netAccountingProfitLoss: bigint;
  exemptions: {
    dividendsReceived: bigint;
    qualifyingParticipationExemption: bigint;
  };
  disallowableExpenses: {
    entertainment50PercentDisallowed: bigint; // 50% non-deductible
    finesAndPenalties: bigint;                // 100% non-deductible
    nonBusinessExpenses: bigint;
  };
  qualifyingFreeZoneStatus: {
    isQFZP: boolean;
    qualifyingRevenue: bigint;
    nonQualifyingRevenue: bigint;
    deMinimisRatioBps: bigint; // Must be <= 500 (5.00%) or AED 5M
    qualifyingIncomeTaxRate: 0; // 0%
    nonQualifyingTaxRate: 900;  // 9%
  };
  taxLossReliefBfwd: bigint; // Capped at 75% of taxable income
  taxableIncome: bigint;
  calculatedTaxDue: bigint;
  verifyWithTaxAdvisor: true; // Hard mandatory safeguard
}
```
