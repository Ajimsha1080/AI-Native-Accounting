import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequestContext } from '@/lib/auth';
import { Permission, TenantDatabaseSession } from '@ledger-ae/shared-types';
import { getDatabasePool } from '@/lib/db';

export const GET = withAuth(Permission.AUDIT_READ)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        // Query audit logs
        const auditRes = await client.query(
          `SELECT
             a.id,
             a.user_id as "userId",
             u.email as "userEmail",
             u.full_name_en as "userNameEn",
             a.role,
             a.action,
             a.resource_type as "resourceType",
             a.resource_id as "resourceId",
             COALESCE(a.payload_after::text, a.action) as "changes",
             a.created_at as "createdAt"
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id AND u.tenant_id = a.tenant_id
           WHERE a.tenant_id = $1
           ORDER BY a.created_at DESC
           LIMIT $2`,
          [session.tenantId, limit]
        );

        // Query active users and roles
        const usersRes = await client.query(
          `SELECT
             id,
             email,
             full_name_en as "nameEn",
             full_name_ar as "nameAr",
             role,
             is_active as "isActive",
             is_2fa_enabled as "is2faEnabled",
             created_at as "createdAt"
           FROM users
           WHERE tenant_id = $1
           ORDER BY created_at ASC`,
          [session.tenantId]
        );

        return NextResponse.json({
          auditLogs: auditRes.rows.map((r: any) => ({
            id: r.id,
            userId: r.userId,
            userEmail: r.userEmail,
            userNameEn: r.userNameEn,
            role: r.role,
            action: r.action,
            resourceType: r.resourceType,
            resourceId: r.resourceId,
            changes: r.changes,
            createdAt: r.createdAt
          })),
          users: usersRes.rows.map((u: any) => ({
            id: u.id,
            email: u.email,
            nameEn: u.nameEn,
            nameAr: u.nameAr,
            role: u.role,
            isActive: u.isActive,
            is2faEnabled: u.is2faEnabled,
            createdAt: u.createdAt
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

export const POST = withAuth(Permission.TENANT_MANAGE)(
  async (request: NextRequest, { session }: AuthenticatedRequestContext) => {
    try {
      const body = await request.json();
      const { targetUserId, newRole } = body;

      if (!targetUserId || !newRole) {
        return NextResponse.json(
          { error: 'Invalid payload: targetUserId and newRole required', code: 'INVALID_PAYLOAD' },
          { status: 400 }
        );
      }

      const pool = getDatabasePool();
      const tenantSession = new TenantDatabaseSession(pool);

      return await tenantSession.withTenant(session.tenantId, async (client) => {
        const uRes = await client.query(
          `UPDATE users
           SET role = $1
           WHERE id = $2 AND tenant_id = $3
           RETURNING id, email, role`,
          [newRole, targetUserId, session.tenantId]
        );

        if (uRes.rows.length === 0) {
          return NextResponse.json({ error: 'User not found in tenant', code: 'NOT_FOUND' }, { status: 404 });
        }

        const user = uRes.rows[0];
        await client.query(
          `INSERT INTO audit_logs (tenant_id, entity_id, user_id, role, action, resource_type, resource_id, diff_hash, payload_after)
           VALUES ($1, $2, $3, $4, 'USER_ROLE_UPDATED', 'USER', $5, 'USER_ROLE_HASH', $6::jsonb)`,
          [
            session.tenantId,
            session.entityId,
            session.userId,
            session.role,
            targetUserId,
            JSON.stringify({ email: user.email, newRole })
          ]
        );

        return NextResponse.json({
          success: true,
          userId: user.id,
          email: user.email,
          newRole: user.role
        });
      });
    } catch (err: any) {
      return NextResponse.json(
        { error: 'Role update failed: ' + err.message, code: 'DB_ERROR' },
        { status: 500 }
      );
    }
  }
);
