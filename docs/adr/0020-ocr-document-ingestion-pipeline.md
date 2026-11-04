# ADR 0020: Unified Bilingual OCR Document Ingestion Pipeline, Deterministic Checks, and Segregation of Duties

## Status
Accepted

## Context
Commercial UAE enterprise ERPs process high volumes of financial documents, including:
1. **Tax Invoices**: Bilingual Arabic and English invoices subject to UAE VAT Decree-Law No. 8 of 2017 (Article 59), requiring strict 15-digit TRN validation (starting with 100), itemized lines, net amounts, standard 5% VAT or zero-rated/reverse-charge categorizations, and exact total verification.
2. **Bank Statements**: Multi-page scanned or born-digital statements requiring account resolution, opening/closing balance verification, running balance continuity checks, and individual row-level journal candidates.
3. **RAG Knowledge Base Documents**: Contracts, tenancy guides, and UAE FTA public clarification documents uploaded for RAG retrieval with citation page tracking.

Previous prototypes relied on naive text extractions or mocked fallbacks (e.g. static TRNs and dummy amounts) which cannot be used in a production financial platform. A production-ready pipeline must adhere to strict principles:
- **Zero invented defaults**: If a field is illegible or missing, it must remain `null` and trigger human review. No hardcoded vendors, fallback TRNs, or default currency amounts.
- **Dynamic model selection**: LLM model identifiers must never be hardcoded and must resolve dynamically from configuration (`ANTHROPIC_MODEL_ID`).
- **Zero float math**: All financial amounts must be strictly represented and verified as integer fils.
- **Deterministic verification before ledger entry**: All extractions must pass deterministic mathematical and double-entry invariants ($\text{Debits} == \text{Credits}$, line-item sum consistency, bank statement running balance continuity) before posting.
- **Segregation of duties (Four-Eyes Principle)**: The creator of a document cannot approve their own item; statutory approval thresholds must require managerial or executive sign-off.

## Decision

We implement a unified, multi-stage document ingestion pipeline:
$$\text{File} \longrightarrow \text{OCR Engine} \longrightarrow \text{Structured Extraction} \longrightarrow \text{Deterministic Checks} \longrightarrow \text{HITL Approval} \longrightarrow \text{General Ledger}$$

### 1. Open-Source Bilingual OCR Engine (`app/ai/ocr/engine.py`)
- **Core Technology**: IBM Docling `DocumentConverter` with `EasyOcrOptions(lang=["ar", "en"])` and `do_table_structure=True`.
- **Formats Handled**: Born-digital PDFs, scanned/photocopied PDFs (rendered via `pypdfium2`), TIFF, PNG, and JPEG.
- **Quality Gates**:
  - Empty or unreadable files are rejected immediately with HTTP 422 (`OcrEmptyOrGarbageError`).
  - Worker thread pool isolation with configurable timeout (`OCR_TIMEOUT_SECONDS=60.0`).
  - Offline preloading in Docker builds (`preload_ocr_models()`).
  - Direct structured formats (XML, MT940, CAMT.053) bypass OCR and use existing deterministic parsers.

### 2. Structured Extraction Stage (`app/ai/ocr_extractor.py`)
- Sends extracted Markdown (with page boundaries and table grids) to Anthropic Claude using structured output / tool use.
- Model identifier dynamically resolved from `settings.ANTHROPIC_MODEL_ID`.
- Secondary Image Opinion: If an OCR page confidence score drops below 0.70, the individual page image is provided as multimodal context to Claude, marking `requiresHumanReview = True` and recording the origin source per field.
- Strictly returns `None` for unextracted fields and compiles an explicit `missingFields` list.

### 3. Deterministic Debit-Credit Invariant Checks (`app/ai/deterministic_checks.py`)
- **Invoices**:
  - Builds `JournalEntryCandidate`: $\text{Debit Expense} + \text{Debit Input VAT} == \text{Credit Accounts Payable}$ (reversed for sales).
  - Enforces $\sum \text{Lines} == \text{Subtotal}$ and $\text{Subtotal} + \text{VAT} == \text{Total}$.
  - Enforces 15-digit UAE TRN format (`^100\d{12}$`).
  - Confidence is calculated dynamically based entirely on check pass rates; zero hardcoded confidence numbers.
- **Bank Statements**:
  - Builds balanced two-line journal candidates per transaction row ($\text{Bank Account} \leftrightarrow \text{Suspense Counter-Account}$).
  - Verifies statement mathematical identity: $\text{Opening Balance} + \sum \text{Credits} - \sum \text{Debits} == \text{Closing Balance}$.
  - Verifies line-by-line running balance continuity and flags exact failing row indices.

### 4. Human-in-the-Loop & Segregation of Duties (`app/ai/hitl_service.py`)
- Items are placed into a pending approval queue if:
  1. `requiresHumanReview == True` (e.g. low OCR confidence, missing mandatory fields).
  2. Any deterministic check fails (e.g. arithmetic variance, invalid TRN).
  3. Total amount exceeds statutory threshold (`DEFAULT_HITL_THRESHOLD_FILS = 1,000,000 fils` / AED 10,000.00).
- **Four-Eyes Enforcement**: Rejects approval attempts where `item.creatorUserId == approver_user_id`.
- **Statutory Tiers**:
  - Tier 1 ($\le \text{AED 10,000}$): Standard accounting staff.
  - Tier 2 ($> \text{AED 10,000}$ and $\le \text{AED 50,000}$): Finance Manager sign-off required.
  - Tier 3 ($> \text{AED 50,000}$): Group CFO / Executive sign-off required.
- **Field Corrections**: Approvers can inspect source images/OCR markdown and apply field corrections, which trigger automated re-verification of all deterministic checks prior to GL entry.

### 5. Unified RAG Document Ingestion (`app/ai/rag/document_ingestion.py`)
- Reuses the open-source OCR pipeline to parse uploaded contracts, FTA guides, and tenant policies.
- Preserves table structures and outputs `page_start`, `page_end`, `language_tag`, and `ocr_confidence` per chunk for citation accuracy.
- Enforces strict tenant isolation via PostgreSQL Row-Level Security (`RLS`).

## Consequences
- Guaranteed zero synthetic defaults or financial hallucinations in GL posting.
- Compliant with UAE Corporate Tax, VAT Decree-Law No. 8, and statutory segregation of duties.
- Complete auditability with immutable action logs capturing token usage, models, and approver user IDs.
