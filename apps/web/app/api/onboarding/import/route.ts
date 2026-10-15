import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.LEDGER_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        const res = await client.query(
          `SELECT
             id,
             source_system as "sourceSystem",
             import_type as "importType",
             filename,
             raw_payload as "rawPayload",
             status,
             records_imported as "recordsImported",
             records_failed as "recordsFailed",
             created_at as "createdAt"
           FROM migration_imports
           WHERE tenant_id = $1
           ORDER BY created_at DESC`,
          [session.tenantId]
        );

        return NextResponse.json({
          imports: res.rows.map((r: any) => ({
            id: r.id,
            sourceSystem: r.sourceSystem,
            importType: r.importType,
            filename: r.filename,
            rawPayload: r.rawPayload,
            status: r.status,
            recordsImported: r.recordsImported,
            recordsFailed: r.recordsFailed,
            createdAt: r.createdAt
          }))
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Database query failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);

export const POST = withAuth(Permission.LEDGER_POST)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { sourceSystem, filename, accounts = [] } = body;

      if (!sourceSystem || !filename || !Array.isArray(accounts)) {
        return NextResponse.json(
          { error: 'Invalid payload: sourceSystem, filename, and accounts array required', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        );
      }

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        let importedCount = 0;

        for (const acc of accounts) {
          if (acc.code && acc.nameEn && acc.type) {
            const normalBalance = (acc.type === 'ASSET' || acc.type === 'EXPENSE') ? 'DEBIT' : 'CREDIT';
            await client.query(
              `INSERT INTO chart_of_accounts (tenant_id, legal_entity_id, code, name_en, name_ar, type, sub_type, normal_balance, is_active)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
               ON CONFLICT (legal_entity_id, code) DO UPDATE
               SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar, type = EXCLUDED.type, normal_balance = EXCLUDED.normal_balance`,
              [
                session.tenantId,
                session.entityId,
                acc.code,
                acc.nameEn,
                acc.nameAr || acc.nameEn,
                acc.type,
                acc.subType || 'OTHER',
                normalBalance
              ]
            );
            importedCount++;
          }
        }

        const importRes = await client.query(
          `INSERT INTO migration_imports (tenant_id, legal_entity_id, source_system, import_type, filename, raw_payload, status, records_imported, records_failed)
           VALUES ($1, $2, $3, 'COA', $4, $5, 'COMPLETED', $6, 0)
           RETURNING id`,
          [
            session.tenantId,
            session.entityId,
            sourceSystem,
            filename,
            JSON.stringify({ sourceSystem, accountsCount: accounts.length }),
            importedCount
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
           VALUES ($1, $2, $3, $4, 'MIGRATION_IMPORTED', 'MIGRATION_IMPORT', $5, 'MIGRATION_HASH', $6::jsonb)`,
          [
            session.tenantId,
            session.entityId,
            session.userId,
            session.role,
            importRes.rows[0].id,
            JSON.stringify({ sourceSystem, filename, importedCount })
          ]
        );

        return NextResponse.json({
          success: true,
          importId: importRes.rows[0].id,
          sourceSystem,
          recordsImported: importedCount
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Migration import failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
