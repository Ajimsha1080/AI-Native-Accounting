"""Autonomous Agent Memory Engine for Ledger AE.

Provides:
1. Working Memory (Short-Term): Active conversation state, current tenant, entity, and sliding context window.
2. Epistemic Memory (Long-Term): Learned vendor classifications, accounting policies, and decision history.
3. Decision Feedback Loop: Learns from user approvals and rejections of AI proposals.
"""

import uuid
from datetime import datetime
from typing import Any

from app.ai.memory.schemas import MemoryItem, MemoryType


class AgentMemoryEngine:
    """Manages short-term session memory and long-term tenant-scoped accounting memory."""

    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_stores()
        return cls._instance

    def _init_stores(self):
        # Long-term memories: tenant_id -> list[MemoryItem]
        self._long_term_memories: dict[str, list[MemoryItem]] = {}
        # Working short-term memories: session_id -> dict
        self._working_sessions: dict[str, dict[str, Any]] = {}
        self._seed_default_memories()

    def _seed_default_memories(self):
        """Pre-seeds standard UAE institutional vendor classifications and accounting policies."""
        default_tenant = "00000000-0000-0000-0000-000000000000"
        
        seeds = [
            # Vendor Classifications
            MemoryItem(
                id="mem-seed-001",
                tenant_id=default_tenant,
                memory_type=MemoryType.VENDOR_CLASSIFICATION,
                key="etisalat",
                value={
                    "vendorName": "Etisalat by e&",
                    "accountCode": "6010",
                    "accountName": "Telecommunications & Internet Expense",
                    "defaultVatRate": 5.0,
                    "rcmApplicable": False,
                },
                confidence=0.99,
                source="SYSTEM_SEEDED",
                hit_count=42,
                notes="Standard UAE telecom supplier - 5% recoverable VAT.",
            ),
            MemoryItem(
                id="mem-seed-002",
                tenant_id=default_tenant,
                memory_type=MemoryType.VENDOR_CLASSIFICATION,
                key="dewa",
                value={
                    "vendorName": "Dubai Electricity & Water Authority (DEWA)",
                    "accountCode": "6011",
                    "accountName": "Electricity & Utilities Expense",
                    "defaultVatRate": 5.0,
                    "rcmApplicable": False,
                },
                confidence=0.99,
                source="SYSTEM_SEEDED",
                hit_count=35,
                notes="Utility supplier in Dubai - 5% standard VAT.",
            ),
            MemoryItem(
                id="mem-seed-003",
                tenant_id=default_tenant,
                memory_type=MemoryType.VENDOR_CLASSIFICATION,
                key="amazon web services",
                value={
                    "vendorName": "Amazon Web Services EMEA SARL",
                    "accountCode": "6020",
                    "accountName": "Cloud Infrastructure & Software",
                    "defaultVatRate": 5.0,
                    "rcmApplicable": True,
                },
                confidence=0.98,
                source="SYSTEM_SEEDED",
                hit_count=28,
                notes="Non-resident electronic services supplier. Subject to UAE VAT Reverse Charge Mechanism (Article 48).",
            ),
            MemoryItem(
                id="mem-seed-004",
                tenant_id=default_tenant,
                memory_type=MemoryType.VENDOR_CLASSIFICATION,
                key="adnoc",
                value={
                    "vendorName": "ADNOC Distribution PJSC",
                    "accountCode": "6040",
                    "accountName": "Motor Vehicle Fuel & Fleet Expense",
                    "defaultVatRate": 5.0,
                    "rcmApplicable": False,
                },
                confidence=0.97,
                source="SYSTEM_SEEDED",
                hit_count=19,
                notes="Commercial fuel expenses - 5% standard VAT.",
            ),
            # Accounting Policies
            MemoryItem(
                id="mem-seed-005",
                tenant_id=default_tenant,
                memory_type=MemoryType.ACCOUNTING_POLICY,
                key="fixed_asset_capitalization_threshold",
                value={
                    "policyName": "Fixed Asset Capitalization Threshold",
                    "thresholdAed": 5000,
                    "thresholdFils": 500000,
                    "actionBelow": "EXPENSE_IMMEDIATELY",
                    "actionAbove": "CAPITALIZE_TO_FIXED_ASSETS",
                },
                confidence=0.99,
                source="SYSTEM_SEEDED",
                hit_count=64,
                notes="Assets below AED 5,000 must be expensed as office supplies or minor tools.",
            ),
            MemoryItem(
                id="mem-seed-006",
                tenant_id=default_tenant,
                memory_type=MemoryType.ACCOUNTING_POLICY,
                key="uae_corporate_tax_rules",
                value={
                    "statutoryLaw": "Federal Decree-Law No. 47 of 2022",
                    "taxRateStandard": 0.09,
                    "exemptionThresholdAed": 375000,
                    "smallBusinessReliefThresholdAed": 3000000,
                },
                confidence=1.0,
                source="SYSTEM_SEEDED",
                hit_count=87,
                notes="0% up to AED 375k; 9% standard corporate tax rate above.",
            ),
            # Decision History Memory
            MemoryItem(
                id="mem-seed-007",
                tenant_id=default_tenant,
                memory_type=MemoryType.DECISION_HISTORY,
                key="cloud_software_rcm_approval",
                value={
                    "proposalType": "TAX_REVERSE_CHARGE",
                    "decision": "APPROVED",
                    "rationale": "CFO approved RCM input/output offset for foreign software subscription.",
                    "appliedAccount": "1300 - Input VAT Recoverable / 2110 - Output VAT Payable",
                },
                confidence=0.95,
                source="HISTORICAL_DECISION",
                hit_count=14,
                notes="Precedent: Foreign digital services always invoke Article 48 RCM offset.",
            ),
        ]
        self._long_term_memories[default_tenant] = seeds

    # -------------------------------------------------------------------------
    # Epistemic / Long-Term Memory API
    # -------------------------------------------------------------------------
    def get_memories(
        self,
        tenant_id: str,
        memory_type: MemoryType | None = None,
        query: str | None = None,
    ) -> list[MemoryItem]:
        """Fetches tenant memories (including global seeded defaults)."""
        tenant_memories = list(self._long_term_memories.get(tenant_id, []))
        default_memories = self._long_term_memories.get("00000000-0000-0000-0000-000000000000", [])

        # Combine, favoring tenant-specific overrides
        all_memories = list(tenant_memories)
        existing_keys = {m.key for m in tenant_memories}
        for default_m in default_memories:
            if default_m.key not in existing_keys:
                all_memories.append(default_m)

        # Filters
        if memory_type:
            all_memories = [m for m in all_memories if m.memory_type == memory_type]

        if query:
            q_clean = query.lower().strip()
            all_memories = [
                m for m in all_memories
                if q_clean in m.key.lower()
                or (m.notes and q_clean in m.notes.lower())
                or q_clean in str(m.value).lower()
            ]

        return [m for m in all_memories if m.is_active]

    def store_memory(
        self,
        tenant_id: str,
        memory_type: MemoryType,
        key: str,
        value: dict[str, Any],
        confidence: float = 0.95,
        source: str = "USER_FEEDBACK",
        notes: str | None = None,
    ) -> MemoryItem:
        """Stores or updates a long-term memory item for a tenant."""
        if tenant_id not in self._long_term_memories:
            self._long_term_memories[tenant_id] = []

        clean_key = key.lower().strip()

        # Check existing
        for existing in self._long_term_memories[tenant_id]:
            if existing.key == clean_key and existing.memory_type == memory_type:
                existing.value = value
                existing.confidence = confidence
                existing.source = source
                existing.notes = notes or existing.notes
                existing.hit_count += 1
                existing.last_accessed_at = datetime.utcnow()
                return existing

        item = MemoryItem(
            id=f"mem-{uuid.uuid4().hex[:8]}",
            tenant_id=tenant_id,
            memory_type=memory_type,
            key=clean_key,
            value=value,
            confidence=confidence,
            source=source,
            hit_count=1,
            notes=notes,
            created_at=datetime.utcnow(),
            last_accessed_at=datetime.utcnow(),
        )
        self._long_term_memories[tenant_id].append(item)
        return item

    def delete_memory(self, tenant_id: str, memory_id: str) -> bool:
        """Deletes (or deactivates) a memory item."""
        if tenant_id in self._long_term_memories:
            for item in self._long_term_memories[tenant_id]:
                if item.id == memory_id:
                    item.is_active = False
                    return True
        return False

    def recall_vendor_mapping(self, tenant_id: str, vendor_name: str) -> dict[str, Any] | None:
        """Looks up a learned vendor account classification."""
        v_clean = vendor_name.lower().strip()
        memories = self.get_memories(tenant_id, memory_type=MemoryType.VENDOR_CLASSIFICATION)

        for mem in memories:
            if mem.key in v_clean or v_clean in mem.key:
                mem.hit_count += 1
                mem.last_accessed_at = datetime.utcnow()
                return {
                    "matchedKey": mem.key,
                    "confidence": mem.confidence,
                    "source": mem.source,
                    **mem.value,
                }
        return None

    def record_proposal_decision_feedback(
        self,
        tenant_id: str,
        proposal_id: str,
        proposal_type: str,
        decision: str,
        rationale: str | None = None,
        proposed_entry: dict[str, Any] | None = None,
    ) -> MemoryItem:
        """Feedback loop: records user's decision into epistemic memory so future proposals learn."""
        key = f"decision_{proposal_type.lower()}_{proposal_id}"
        notes = f"User {decision} proposal {proposal_id}. Rationale: {rationale or 'Standard audit approval'}"
        value = {
            "proposalId": proposal_id,
            "proposalType": proposal_type,
            "decision": decision,
            "rationale": rationale,
            "entrySnapshot": proposed_entry,
            "recordedAt": datetime.utcnow().isoformat(),
        }
        return self.store_memory(
            tenant_id=tenant_id,
            memory_type=MemoryType.DECISION_HISTORY,
            key=key,
            value=value,
            confidence=0.98 if decision == "APPROVED" else 0.85,
            source="USER_FEEDBACK",
            notes=notes,
        )

    # -------------------------------------------------------------------------
    # Working / Short-Term Session Memory API
    # -------------------------------------------------------------------------
    def get_working_session(self, session_id: str, tenant_id: str) -> dict[str, Any]:
        """Fetches or initializes working memory for an active session."""
        if session_id not in self._working_sessions:
            self._working_sessions[session_id] = {
                "sessionId": session_id,
                "tenantId": tenant_id,
                "activeEntityId": None,
                "activeFiscalPeriod": "2026-Q1",
                "conversationTurns": [],
                "recentTransactions": [],
                "created_at": datetime.utcnow().isoformat(),
            }
        return self._working_sessions[session_id]

    def add_conversation_turn(
        self,
        session_id: str,
        tenant_id: str,
        role: str,
        content: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Appends a turn to the sliding context window (max 10 turns preserved)."""
        session = self.get_working_session(session_id, tenant_id)
        session["conversationTurns"].append({
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": metadata or {},
        })
        # Keep sliding window bounded to last 10 turns
        if len(session["conversationTurns"]) > 10:
            session["conversationTurns"] = session["conversationTurns"][-10:]
