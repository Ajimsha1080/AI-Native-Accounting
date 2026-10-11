/**
 * LedgerAE Shared Types & Core Financial Schemas
 * Strictly typed definitions for multi-tenant ERP in the UAE.
 */

export type UUID = string;

export enum CurrencyCode {
  AED = 'AED',
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  SAR = 'SAR',
  KWD = 'KWD',
  BHD = 'BHD',
  OMR = 'OMR',
  QAR = 'QAR',
  INR = 'INR'
}

/** Money represented as integer minor units to eliminate floating-point drift */
export interface MoneyAmount {
  /** Value in minor units (e.g. 100.50 AED = 10050n fils) */
  amount: bigint;
  currency: CurrencyCode | string;
  decimals: number;
}

export enum UserRole {
  OWNER = 'OWNER',
  CFO = 'CFO',
  FINANCIAL_CONTROLLER = 'FINANCIAL_CONTROLLER',
  SENIOR_ACCOUNTANT = 'SENIOR_ACCOUNTANT',
  JUNIOR_ACCOUNTANT = 'JUNIOR_ACCOUNTANT',
  EXTERNAL_AUDITOR = 'EXTERNAL_AUDITOR',
  TAX_AGENT = 'TAX_AGENT',
  VIEWER = 'VIEWER'
}

export enum Permission {
  // Ledger permissions
  LEDGER_POST = 'ledger:post',
  LEDGER_READ = 'ledger:read',
  LEDGER_LOCK = 'ledger:lock',
  LEDGER_REOPEN = 'ledger:reopen',

  // AP / AR permissions
  INVOICE_CREATE = 'invoice:create',
  INVOICE_APPROVE = 'invoice:approve',
  BILL_CREATE = 'bill:create',
  BILL_APPROVE_TIER1 = 'bill:approve:tier1', // up to 10k AED
  BILL_APPROVE_TIER2 = 'bill:approve:tier2', // up to 50k AED
  BILL_APPROVE_TIER3 = 'bill:approve:tier3', // > 50k AED

  // Banking
  BANK_RECONCILE = 'bank:reconcile',
  PAYMENT_RUN_EXECUTE = 'payment:execute',

  // Tax & E-Invoicing
  TAX_SUBMIT = 'tax:submit',
  EINVOICE_TRANSMIT = 'einvoice:transmit',

  // Administration & Audit
  AUDIT_READ = 'audit:read',
  TENANT_MANAGE = 'tenant:manage'
}

export enum UAEJurisdictionType {
  MAINLAND = 'MAINLAND',
  FREE_ZONE = 'FREE_ZONE',
  FINANCIAL_FREE_ZONE = 'FINANCIAL_FREE_ZONE' // ADGM, DIFC
}

export enum Emirate {
  ABU_DHABI = 'ABU_DHABI',
  DUBAI = 'DUBAI',
  SHARJAH = 'SHARJAH',
  AJMAN = 'AJMAN',
  UMM_AL_QUWAIN = 'UMM_AL_QUWAIN',
  RAS_AL_KHAIMAH = 'RAS_AL_KHAIMAH',
  FUJAIRAH = 'FUJAIRAH'
}

export interface TenantContext {
  tenantId: UUID;
  entityId: UUID;
  userId: UUID;
  role: UserRole;
  permissions: Permission[];
}

export interface AuditLogEntry {
  id: UUID;
  tenantId: UUID;
  entityId: UUID;
  userId: UUID;
  role: UserRole;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  payloadBefore?: Record<string, unknown> | null;
  payloadAfter?: Record<string, unknown> | null;
  diffHash: string;
  aiAgentMetadata?: {
    isAiInitiated: boolean;
    agentName?: string;
    modelUsed?: string;
    promptVersion?: string;
    confidenceScore?: number;
  };
  createdAt: string;
}

export enum LanguageLocale {
  EN = 'en',
  AR = 'ar'
}

export interface LocalizationConfig {
  locale: LanguageLocale;
  isRtl: boolean;
  calendar: 'gregorian' | 'hijri';
  currencyDisplay: 'AED' | 'د.إ';
}

export * from './rbac.js';
export * from './audit.js';
export * from './migration-runner.js';


