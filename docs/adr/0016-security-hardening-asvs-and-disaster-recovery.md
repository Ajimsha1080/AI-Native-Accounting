# ADR 0016: Security Hardening (OWASP ASVS L2), Penetration Testing, and Disaster Recovery Architecture

## Status
Accepted

## Context
Prior to general availability (GA) and live commercial pilot deployment with UAE multi-entity mid-market groups, LedgerAE must satisfy stringent non-functional security, privacy, and business continuity requirements:
1. **OWASP Application Security Verification Standard (ASVS) Level 2**:
   - V1: Tenancy isolation enforced at database and application layers.
   - V4: Access control preventing horizontal tenant escalation, BOLA/IDOR, and vertical role tampering.
   - V5: Input validation blocking SQL injection, script injection (XSS), and directory traversal attacks.
   - V8: Cryptography for data at rest (AES-256) and in transit (TLS 1.3), with immutable Merkle SHA-256 voucher hash chaining.
   - V10: Server-Side Request Forgery (SSRF) defense prohibiting outbound webhook dispatch to internal networks, RFC 1918 private IP ranges, localhost, and cloud metadata endpoints (`169.254.169.254`).
2. **UAE Personal Data Protection Law (PDPL - Federal Decree-Law No. 45 of 2021) & Tax Procedures Law (Federal Decree-Law No. 28 of 2022)**:
   - Financial accounting records must be retained for a minimum statutory period of 5 years (commercial) or 7 years (real estate / designated zones).
   - Records under active **Legal Hold** must be immutable and immune to automated purge/deletion routines regardless of age.
3. **Disaster Recovery (DR) & Business Continuity Targets**:
   - **Availability**: $99.9\%$.
   - **Recovery Point Objective (RPO)**: $\le 5\text{ minutes}$ (via continuous PostgreSQL Write-Ahead Log / WAL streaming to UAE-region S3-compatible object storage).
   - **Recovery Time Objective (RTO)**: $\le 1\text{ hour}$ ($3600\text{ seconds}$).
   - **Integrity Invariant**: Restored databases must maintain exact double-entry balance ($\sum \text{Debits} == \sum \text{Credits}$ to $0\text{ fils}$) and $100\%$ voucher hash integrity.

## Decision
1. **Security Hardening Subsystem (`SecurityHardeningEngine`)**:
   - Implemented in `@ledger-ae/ledger-core`:
     - `validateWebhookUrl`: Rejects non-HTTPS schemes, private IPv4 ranges, and cloud metadata IP addresses to mitigate SSRF.
     - `detectInjectionAttempt`: Detects SQLi, XSS, and path traversal signatures.
     - `assertTenantIsolation`: Programmatically aborts any mutation or query where active session tenant differs from resource tenant.
     - `assertDeletionPermitted`: Enforces statutory retention dates and active Legal Hold blocks under UAE PDPL.
2. **Disaster Recovery Restore Drill Simulator (`DisasterRecoveryEngine`)**:
   - Implemented automated quarterly PITR restore simulation:
     - Measures elapsed data loss window between simulated failure and last WAL checkpoint to verify RPO $\le 5\text{ minutes}$.
     - Measures restore and re-indexing duration to verify RTO $\le 1\text{ hour}$.
     - Runs post-restore ledger invariant verification confirming Debits == Credits with 0 fils variance and intact SHA-256 Merkle hashes.
3. **Pre-GA Pilot Release Checklist**:
   - Formalized `docs/ga-release-pilot-checklist.md` certifying readiness across all 13 milestones.

## Consequences
- Protects corporate ledger data against external penetration, internal privilege escalation, and SSRF pivoting.
- Complies with UAE data residency and PDPL retention requirements.
- Confirms automated point-in-time recovery capabilities that can recover the entire ERP in minutes during an unforeseen outage.
