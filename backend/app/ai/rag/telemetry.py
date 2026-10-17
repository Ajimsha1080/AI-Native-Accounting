"""Privacy-Conscious RAG Observability and Telemetry Module.

Tracks query classifications, latency, retrieval counts, sufficiency assessments,
claim validations, and abstentions without logging credentials or raw confidential payload.
"""

import json
import logging
import time

from app.ai.rag.schemas import TelemetryRecord

logger = logging.getLogger("ledger_ae.rag.telemetry")


class RagTelemetryCollector:
    """Collects and reports operational telemetry events for enterprise RAG pipeline."""

    def __init__(self, correlation_id: str, tenant_id: str):
        self.correlation_id = correlation_id
        self.tenant_id = tenant_id
        self.start_time = time.perf_counter()

    def record_and_log(self, record: TelemetryRecord) -> None:
        """Emits structured JSON log for observability platforms."""
        duration = round((time.perf_counter() - self.start_time) * 1000, 2)
        record.total_latency_ms = duration

        log_data = {
            "event": "rag_pipeline_execution",
            "correlation_id": record.correlation_id,
            "tenant_id": record.tenant_id,
            "intent": record.intent.value,
            "original_query_len": len(record.original_query),
            "was_rewritten": record.rewritten_query is not None,
            "retrieval_count": record.retrieval_count,
            "rrf_count": record.rrf_count,
            "reranked_count": record.reranked_count,
            "sufficiency_status": record.sufficiency_status.value,
            "claims_count": record.claims_count,
            "grounded_claims_count": record.grounded_claims_count,
            "citations_count": record.citations_count,
            "abstained": record.abstained,
            "correction_retries": record.correction_retries,
            "total_latency_ms": record.total_latency_ms,
            "disclaimer_present": record.disclaimer_present,
        }

        logger.info(json.dumps(log_data))
