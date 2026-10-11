import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

interface TenantRecord {
  id: string;
  tenantId: string;
  data: string;
}

/**
 * Mocking the PostgreSQL Session RLS context engine
 */
class MockPostgresSession {
  private currentTenantId: string | null = null;
  private database: TenantRecord[] = [];

  setTenantContext(tenantId: string) {
    this.currentTenantId = tenantId;
  }

  clearTenantContext() {
    this.currentTenantId = null;
  }

  insertRecord(record: TenantRecord) {
    this.database.push(record);
  }

  // Emulates PostgreSQL RLS Policy: WHERE tenant_id = app.get_current_tenant_id()
  queryRecords(): TenantRecord[] {
    if (!this.currentTenantId) {
      return []; // RLS denies all access if context is unset
    }
    return this.database.filter((r) => r.tenantId === this.currentTenantId);
  }
}

describe('PostgreSQL Row-Level Security (RLS) Tenant Isolation Test', () => {
  const db = new MockPostgresSession();

  const tenantA = 'tenant-dubai-holding-001';
  const tenantB = 'tenant-adgm-capital-002';

  db.insertRecord({ id: 'rec-1', tenantId: tenantA, data: 'Dubai Holding Q1 Books' });
  db.insertRecord({ id: 'rec-2', tenantId: tenantA, data: 'Dubai Holding Bank Statements' });
  db.insertRecord({ id: 'rec-3', tenantId: tenantB, data: 'ADGM Capital Secret Portfolio' });

  test('Tenant A cannot see Tenant B records under RLS', () => {
    db.setTenantContext(tenantA);
    const resultsA = db.queryRecords();
    assert.equal(resultsA.length, 2);
    assert.ok(resultsA.every((r) => r.tenantId === tenantA));
    assert.equal(resultsA.some((r) => r.tenantId === tenantB), false);
  });

  test('Tenant B cannot see Tenant A records under RLS', () => {
    db.setTenantContext(tenantB);
    const resultsB = db.queryRecords();
    assert.equal(resultsB.length, 1);
    assert.equal(resultsB[0].data, 'ADGM Capital Secret Portfolio');
    assert.equal(resultsB.some((r) => r.tenantId === tenantA), false);
  });

  test('Unauthenticated or empty session returns zero records', () => {
    db.clearTenantContext();
    const resultsEmpty = db.queryRecords();
    assert.equal(resultsEmpty.length, 0);
  });
});
