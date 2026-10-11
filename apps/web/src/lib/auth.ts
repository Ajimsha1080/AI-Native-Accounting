import { NextRequest, NextResponse } from 'next/server';
import { AuthenticationService, UserSessionPayload, UserRole, Permission, RbacService } from '@ledger-ae/shared-types';

const rbac = new RbacService();

export interface AuthenticatedRequestContext {
  session: UserSessionPayload;
  params: Record<string, string>;
}

export type AuthenticatedRouteHandler = (
  req: NextRequest,
  context: AuthenticatedRequestContext
) => Promise<NextResponse>;

/**
 * Higher-order Route Handler wrapper: withAuth(permission)
 * 1. Validates cryptographic session cookie (or Authorization Bearer token)
 * 2. Enforces RBAC permissions & segregation of duties
 * 3. Injects authenticated session (tenantId, entityId, userId, role) into route context
 * 4. Strictly prevents client headers (x-tenant-id, x-entity-id) from overriding server session
 */
export function withAuth(requiredPermission?: Permission) {
  return function (handler: AuthenticatedRouteHandler) {
    return async function (req: NextRequest, context?: { params?: Promise<Record<string, string>> | Record<string, string> }): Promise<NextResponse> {
      const jwtSecret = process.env.JWT_SECRET || 'fallback_dev_jwt_secret_min_32_characters_long';

      // 1. Extract session token from cookie or Authorization header
      const cookieToken = req.cookies.get('ledger_session')?.value;
      const authHeader = req.headers.get('authorization');
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const token = cookieToken || bearerToken;

      if (!token) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED: Missing session token or authentication credentials' },
          { status: 401 }
        );
      }

      // 2. Validate cryptographic signature & expiration
      const session = AuthenticationService.verifySessionToken(token, jwtSecret);
      if (!session) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED: Invalid or expired session token' },
          { status: 401 }
        );
      }

      // 3. Enforce RBAC permissions if specified
      if (requiredPermission && !rbac.hasPermission(session.role, requiredPermission)) {
        return NextResponse.json(
          {
            error: `FORBIDDEN: User role "${session.role}" lacks required permission "${requiredPermission}"`
          },
          { status: 403 }
        );
      }

      // Resolve params if promise
      let resolvedParams: Record<string, string> = {};
      if (context?.params) {
        resolvedParams = context.params instanceof Promise ? await context.params : context.params;
      }

      // 4. Delegate to underlying handler with authenticated context
      return handler(req, {
        session,
        params: resolvedParams
      });
    };
  };
}
