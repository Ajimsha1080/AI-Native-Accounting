"""Schemas for Autonomous Agent Memory Engine."""

from datetime import datetime
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


class MemoryType(str, Enum):
    VENDOR_CLASSIFICATION = "VENDOR_CLASSIFICATION"
    ACCOUNTING_POLICY = "ACCOUNTING_POLICY"
    DECISION_HISTORY = "DECISION_HISTORY"
    TENANT_CONTEXT = "TENANT_CONTEXT"


class MemoryItem(BaseModel):
    id: str
    tenant_id: str
    memory_type: MemoryType
    key: str
    value: dict[str, Any]
    confidence: float = Field(default=0.95, ge=0.0, le=1.0)
    source: str = "SYSTEM_SEEDED"  # USER_FEEDBACK, HISTORICAL_DECISION, SYSTEM_SEEDED, OCR_INFERENCE
    hit_count: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed_at: datetime | None = None
    notes: str | None = None


class CreateMemoryRequest(BaseModel):
    memoryType: MemoryType
    key: str
    value: dict[str, Any]
    confidence: float = Field(default=0.95, ge=0.1, le=1.0)
    notes: str | None = None


class MemorySearchQuery(BaseModel):
    query: str = Field(min_length=1, max_length=200)
    memoryType: MemoryType | None = None
    minConfidence: float = 0.5
