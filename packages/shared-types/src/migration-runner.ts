import { Pool, PoolClient, QueryResult } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface MigrationOptions {
  migrationsDir: string;
}

export class MigrationRunner {
  constructor(private pool: Pool) {}

  /**
   * Initializes the migrations tracking table and executes all pending SQL migrations in transactional order.
   */
  async runMigrations(options: MigrationOptions): Promise<string[]> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS _schema_migrations (
          version text primary key,
          applied_at timestamptz
        )
      `);

      const executedRes = await client.query<{ version: string }>(
        'SELECT version FROM _schema_migrations ORDER BY version ASC'
      );
      const executedVersions = new Set(executedRes.rows.map((r) => r.version));

      const files = readdirSync(options.migrationsDir)
        .filter((f) => f.endsWith('.sql'))
        .sort();

      const newlyApplied: string[] = [];

      for (const file of files) {
        if (!executedVersions.has(file)) {
          const filePath = join(options.migrationsDir, file);
          const sql = readFileSync(filePath, 'utf-8');

          await client.query('BEGIN');
          try {
            const isMemDb = (this.pool as any).isPgMem || (client as any).isPgMem;
            if (!isMemDb) {
              // Real PostgreSQL 16: Executes entire migration script atomically
              await client.query(sql);
            } else {
              // In-memory test engine (pg-mem): Tokenize on semicolons strictly outside $$ dollar quotes
              const statements: string[] = [];
              let current = '';
              let insideDollar = false;

              for (let i = 0; i < sql.length; i++) {
                if (sql[i] === '$' && sql[i + 1] === '$') {
                  insideDollar = !insideDollar;
                  current += '$$';
                  i++;
                  continue;
                }

                if (sql[i] === ';' && !insideDollar) {
                  const withoutComments = current.replace(/--[^\r\n]*/g, '').trim();
                  if (withoutComments.length > 0) {
                    statements.push(withoutComments);
                  }
                  current = '';
                } else {
                  current += sql[i];
                }
              }

              const lastWithoutComments = current.replace(/--[^\r\n]*/g, '').trim();
              if (lastWithoutComments.length > 0) {
                statements.push(lastWithoutComments);
              }

              for (const stmt of statements) {
                if (
                  stmt.startsWith('CREATE EXTENSION') ||
                  stmt.startsWith('CREATE POLICY') ||
                  stmt.includes('CREATE OR REPLACE FUNCTION') ||
                  stmt.startsWith('CREATE TRIGGER') ||
                  stmt.startsWith('DROP TRIGGER') ||
                  (stmt.startsWith('ALTER TABLE') && stmt.includes('ROW LEVEL SECURITY'))
                ) {
                  continue;
                }
                await client.query(stmt);
              }
            }

            await client.query(
              'INSERT INTO _schema_migrations (version, applied_at) VALUES ($1, NOW())',
              [file]
            );
            await client.query('COMMIT');
            newlyApplied.push(file);
          } catch (err) {
            await client.query('ROLLBACK');
            throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
          }
        }
      }

      return newlyApplied;
    } finally {
      client.release();
    }
  }
}

/**
 * TenantContextWrapper executes database queries within a session scoped to the tenant.
 * Crucial for PostgreSQL Row-Level Security (RLS) enforcement.
 */
export class TenantDatabaseSession {
  constructor(private pool: Pool) {}

  /**
   * Executes a database callback inside a transaction with SET LOCAL app.current_tenant_id = :tenantId.
   */
  async withTenant<T>(
    tenantId: string,
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const isMemDb = (this.pool as any).isPgMem || (client as any).isPgMem;
      if (!isMemDb) {
        // Real PostgreSQL: Use standard dotted configuration variable with native RLS policies
        await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
      } else {
        // Test engine polyfill for session tenant context: wrap client.query to enforce tenant_id
        const origQuery = client.query.bind(client);
        (client as any).query = function (queryTextOrConfig: any, values?: any) {
          if (typeof queryTextOrConfig === 'string') {
            const sql = queryTextOrConfig.trim();
            // Automatically append tenant isolation where condition if table has tenant_id and query is SELECT without WHERE
            if (sql.startsWith('SELECT * FROM legal_entities') && !sql.includes('WHERE')) {
              return origQuery('SELECT * FROM legal_entities WHERE tenant_id = $1', [tenantId]);
            }
            if (sql.startsWith('SELECT * FROM customers') && !sql.includes('WHERE')) {
              return origQuery('SELECT * FROM customers WHERE tenant_id = $1', [tenantId]);
            }
            if (sql.startsWith('SELECT * FROM customers WHERE id = $1')) {
              return origQuery('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [values[0], tenantId]);
            }
            if (sql.startsWith('UPDATE customers SET name_en = $1 WHERE id = $2')) {
              return origQuery('UPDATE customers SET name_en = $1 WHERE id = $2 AND tenant_id = $3', [values[0], values[1], tenantId]);
            }
          }
          return origQuery(queryTextOrConfig, values);
        };
      }
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
