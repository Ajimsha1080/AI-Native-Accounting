# Operational Runbooks: Incident Response, Key Rotation & Database DR

**Target System:** LedgerAE Enterprise ERP  
**Audience:** Site Reliability Engineers (SRE), DevOps & On-Call Engineering Leads  
**Version:** 1.0.0 (Production Verified)  

---

## Runbook 01: Database Point-in-Time Restore (PITR) & Disaster Recovery

### When to Execute
- Severe database corruption, unrecoverable ransomware event, or accidental drops in managed PostgreSQL.

### Prerequisites
- Access to managed PostgreSQL primary and standby replicas.
- Encrypted backup bucket access (`me-central-1`).
- PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`).

### Execution Steps
1. **Isolate Workload:**
   - Stop web traffic to prevent inconsistent ledger writes:
     ```bash
     kubectl scale deployment ledgera-web --replicas=0
     kubectl scale deployment ledgera-worker --replicas=0
     ```
2. **Identify Target Recovery Timestamp:**
   - Review audit logs or WAL timeline to identify the exact second before the corrupting event (`YYYY-MM-DD HH:MM:SSZ`).
3. **Execute Point-in-Time Restore:**
   - On managed PostgreSQL (e.g. AWS RDS / Azure Flexible Server):
     ```bash
     aws rds restore-db-instance-to-point-in-time \
       --source-db-instance-identifier ledgera-prod-db \
       --target-db-instance-identifier ledgera-restored-db \
       --restore-time 2026-10-12T01:30:00Z \
       --db-subnet-group-name ledgera-db-subnet
     ```
4. **Run Automated Integrity Drill & Invariant Verification:**
   - Run the automated drill validation script:
     ```bash
     node scripts/dr/run-real-postgres-restore-drill.mjs
     ```
   - Confirm:
     - All 33 schema tables present.
     - Row counts match pre-incident snapshots.
     - Double-entry invariant holds: $\sum \text{Debits} == \sum \text{Credits}$ with 0 fils variance.
5. **Switch Traffic & Scale Back:**
   - Update database DNS / connection pooler to point to the restored instance.
   - Scale deployments back to desired replica counts:
     ```bash
     kubectl scale deployment ledgera-web --replicas=3
     kubectl scale deployment ledgera-worker --replicas=2
     ```

---

## Runbook 02: Cryptographic Key & Secret Rotation

### When to Execute
- Routine 90-day secret rotation, or immediate emergency rotation in case of suspected credential compromise.

### In-Scope Secrets
1. `JWT_SECRET` (HMAC-SHA256 session token signing)
2. `ENCRYPTION_KEY` (AES-256-GCM database field encryption)
3. `MCP_SIGNING_SECRET` (Model Context Protocol HMAC tickets)
4. `WEBHOOK_SIGNING_SECRET` (Transactional outbox delivery signatures)

### Zero-Downtime Rotation Procedure
1. **JWT Secret Rotation:**
   - Set `JWT_SECRET_SECONDARY` in environment variables with the old key, and `JWT_SECRET` with the new 32-byte key.
   - Allow existing sessions to expire (or revoke active sessions in `sessions` table).
   - After expiration period, remove `JWT_SECRET_SECONDARY`.
2. **Database Field Encryption Key Rotation (`ENCRYPTION_KEY`):**
   - Execute the re-encryption batch job across `user_totp_secrets` and integration tokens:
     ```bash
     node scripts/security/rotate-encryption-key.mjs --old-key-env ENCRYPTION_KEY_OLD --new-key-env ENCRYPTION_KEY_NEW
     ```
   - Verify that all TOTP secrets decrypt cleanly.
3. **Validation & Enforcement:**
   - Both `JWT_SECRET` and `ENCRYPTION_KEY` are verified at application startup. If either key is shorter than 32 bytes (256 bits), startup fails closed immediately.

---

## Runbook 03: E-Invoicing Transmission Failure & Dead-Letter Queue (DLQ) Remediation

### When to Execute
- Invoices stuck in `PENDING` e-invoice status or alerts triggered on `einvoice_messages` transmission failure.

### Remediation Procedure
1. **Inspect Dead-Letter Queue:**
   - Query failed e-invoice transmissions:
     ```sql
     SELECT id, invoice_id, transmission_status, asp_tracking_id, created_at
     FROM einvoice_messages
     WHERE transmission_status IN ('REJECTED', 'QUEUED_DLQ')
     ORDER BY created_at DESC;
     ```
2. **Analyze Failure Classification:**
   - **Scenario A: Transient Gateway Outage (HTTP 502/503/504):**
     - Temporal retry activity automatically attempts redelivery up to 5 times with exponential backoff.
     - Manually trigger replay if backoff exhausted:
       ```bash
       npm run start -w @ledger-ae/ledger-core -- --retry-dlq einvoice
       ```
   - **Scenario B: Schema or Statutory Validation Error (e.g. Invalid TRN or Peppol PINT rule breach):**
     - Permanent rejection is fail-closed.
     - Inspect document validation logs in `ai_action_logs`.
     - Request accountant review to update customer TRN or credit note reference before issuing replacement document.
