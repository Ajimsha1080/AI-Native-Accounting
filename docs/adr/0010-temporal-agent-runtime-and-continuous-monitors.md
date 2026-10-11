# ADR 0010: Temporal-Driven Durable Agent Runtime & Continuous Monitor Invariants

## Status
Accepted

## Context
Autonomous AI agents in LedgerAE execute complex, long-running financial processes: month-end accrual estimates, continuous anomaly and fraud detection, and transaction reclassification proposals.
Key enterprise constraints dictate:
1. **Durable Execution & Restart Survival**: Background worker processes and Kubernetes pods can crash, be evicted (OOM/spot instances), or suffer transient database timeouts. Agent workflows must resume from their exact checkpointed state without repeating completed side effects or dropping tasks.
2. **Strict Guardrail Invariant**: Under no circumstance may an AI agent write or mutate posted entries in the general ledger directly. All outputs must strictly be formatted as prospective proposals (`AgentProposal`) requiring human review or meeting strict auto-approval policies.
3. **Audit & Observability**: Every execution run must maintain an immutable run history capturing run IDs, step checkpoints, retry attempts, error logs, and emitted proposal IDs.

## Decision
1. **Temporal-Inspired Durable Workflow Runtime (`DurableAgentRuntime`)**:
   - Workflows are structured into sequential, named steps with durable state checkpointing.
   - On worker crashes, `recoverWorkflowAfterCrash` restores state from the latest checkpoint, enabling idempotent replay.
   - Failed steps trigger automatic retries with attempt counters and error logging.
2. **Proposals-Only Policy (`AgentRuntimeGuardrails`)**:
   - All agent outputs are typed `AgentProposal` items.
   - Proposals encapsulate the prospective journal entry candidate, bilingual rationale (English & Arabic), confidence score ($0.0-1.0$), and review status.
   - Auto-approval is restricted to tasks meeting the `AutoApprovePolicy` (confidence $\ge 95\%$, total amount $\le \text{AED } 1,000$, and whitelisted task types).
3. **Continuous Anomaly Monitoring Engine (`ContinuousAiMonitor`)**:
   - Scans ledger entries and incoming bills across 6 statutory categories:
     1. Duplicate bills (matching vendor and bill number, or matching vendor, date, and amount).
     2. Missing TRN on 5% VAT invoices.
     3. Article 53 non-recoverable client entertainment VAT misclassifications.
     4. Central Bank USD/AED peg (3.6725) outliers.
     5. Missing recurring month-end accruals.
     6. Financial statement flux variances ($> \text{AED } 10,000$ and $> 20\%$).
   - Findings are converted into assignable audit tasks with severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) and role assignments (`AP_CLERK`, `TAX_AGENT`, `CONTROLLER`).

## Consequences
- Guaranteed zero unapproved ledger modifications.
- High fault tolerance: Agent jobs survive pod evictions and transient infrastructure failures.
- Complete audit transparency for CPAs and internal audit teams.
