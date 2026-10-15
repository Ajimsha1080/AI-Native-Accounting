import { Pool } from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MigrationRunner } from '@ledger-ae/shared-types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString =
  process.env.ADMIN_DATABASE_URL ||
  process.env.TEST_DATABASE_URL ||
  'postgresql://postgres:postgrespassword@localhost:9527/ledger_ae_test';

const pool = new Pool({
  connectionString
});

async function resetDb() {
  const client = await pool.connect();
  try {
    console.log('Resetting local test database to clean state...');
    const tablesRes = await client.query(`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `);
    if (tablesRes.rows.length > 0) {
      const tableNames = tablesRes.rows.map(r => `"${r.tablename}"`).join(', ');
      await client.query(`DROP TABLE IF EXISTS ${tableNames} CASCADE`);
      console.log(`Dropped tables: ${tableNames}`);
    }
  } finally {
    client.release();
  }

  // Run all migrations cleanly from scratch
  const migrationsDir = path.resolve(__dirname, '../packages/shared-types/migrations');
  const runner = new MigrationRunner(pool);
  const applied = await runner.runMigrations({ migrationsDir });
  console.log(`Cleanly applied ${applied.length} migration(s).`);

  const clientGrant = await pool.connect();
  try {
    await clientGrant.query(`
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ledger_app;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ledger_app;
      GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO ledger_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ledger_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ledger_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO ledger_app;
    `);
    console.log('Granted all permissions to ledger_app role.');
  } finally {
    clientGrant.release();
  }

  await pool.end();
}

resetDb().catch((err) => {
  console.error(err);
  process.exit(1);
});
