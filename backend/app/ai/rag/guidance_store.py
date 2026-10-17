"""Statutory Guidance Knowledge Base for UAE Accounting & Tax RAG.

Provides vetted legal, regulatory, and standard chunks with exact citation lineage.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class GuidanceChunk:
    chunk_id: str
    statutory_authority: str
    law_reference: str
    title_en: str
    title_ar: str
    content: str
    category: str  # VAT, CORPORATE_TAX, PAYROLL, IFRS, AUDIT
    keywords: tuple[str, ...]


STATUTORY_GUIDANCE_CORPUS: list[GuidanceChunk] = [
    GuidanceChunk(
        chunk_id="vat-art-08",
        statutory_authority="UAE Federal Tax Authority",
        law_reference="Federal Decree-Law No. 8 of 2017, Article 8",
        title_en="Tax Rates & Standard Rating (5%)",
        title_ar="نسبة الضريبة والنسبة الأساسية (5%)",
        content=(
            "Tax shall be imposed at a standard rate of 5% on any supply or Import of Goods or Services, "
            "unless explicitly exempted or zero-rated under Articles 45 and 46 of this Decree-Law."
        ),
        category="VAT",
        keywords=("standard", "rate", "5%", "vat", "taxable", "supply"),
    ),
    GuidanceChunk(
        chunk_id="vat-art-45-export",
        statutory_authority="UAE Federal Tax Authority",
        law_reference="Federal Decree-Law No. 8 of 2017, Article 45(1)",
        title_en="Zero-Rating of Direct and Indirect Exports",
        title_ar="النسبة الصفرية للصادرات المباشرة وغير المباشرة",
        content=(
            "A direct or indirect export of Goods outside the Implementing States shall be subject to Tax at the rate of 0%. "
            "Official proof of exit and commercial customs clearance documents must be retained in accordance with Executive Regulations."
        ),
        category="VAT",
        keywords=("zero-rated", "export", "cross-border", "customs", "proof of exit", "0%"),
    ),
    GuidanceChunk(
        chunk_id="vat-art-48-rcm",
        statutory_authority="UAE Federal Tax Authority",
        law_reference="Federal Decree-Law No. 8 of 2017, Article 48",
        title_en="Reverse Charge Mechanism (RCM) on Imported Services",
        title_ar="آلية الاحتساب العكسي للخدمات المستوردة",
        content=(
            "If a Taxable Person imports Goods or Services for the purposes of his Business, he shall be treated as making a Taxable Supply to himself "
            "and shall be responsible for all Tax obligations. Output tax is declared in Box 3 and eligible input tax is recovered in Box 10."
        ),
        category="VAT",
        keywords=(
            "reverse charge",
            "rcm",
            "imported services",
            "foreign",
            "aws",
            "microsoft",
            "box 3",
            "box 10",
        ),
    ),
    GuidanceChunk(
        chunk_id="vat-art-53-blocked",
        statutory_authority="UAE Federal Tax Authority",
        law_reference="Cabinet Decision No. 52 of 2017, Article 53",
        title_en="Non-Recoverable Blocked Input Tax on Client Entertainment Services",
        title_ar="ضريبة المدخلات غير القابلة للاسترداد لخدمات الترفيه",
        content=(
            "Input Tax (VAT) shall not be recovered on expenditure incurred on entertainment services provided to any person who is not an employee, "
            "including hospitality, food, beverages, and recreational events for prospective or existing clients or customers."
        ),
        category="VAT",
        keywords=(
            "blocked",
            "entertainment",
            "non-recoverable",
            "hospitality",
            "meals",
            "client",
            "vat",
            "tax",
            "rate",
        ),
    ),
    GuidanceChunk(
        chunk_id="ct-art-03-rates",
        statutory_authority="UAE Ministry of Finance",
        law_reference="Federal Decree-Law No. 47 of 2022, Article 3",
        title_en="Corporate Tax Rates & Profit Thresholds",
        title_ar="نسب ضريبة الشركات والحدود المعفاة",
        content=(
            "Corporate Tax shall be imposed on Taxable Income at the rate of 0% on that part of the Taxable Income "
            "not exceeding AED 375,000, and 9% on that part of the Taxable Income exceeding AED 375,000."
        ),
        category="CORPORATE_TAX",
        keywords=("corporate tax", "9%", "375,000", "threshold", "taxable income", "statutory"),
    ),
    GuidanceChunk(
        chunk_id="ct-art-18-qfzp",
        statutory_authority="UAE Ministry of Finance",
        law_reference="Cabinet Decision No. 139 of 2023 & Ministerial Decision No. 265 of 2023",
        title_en="Qualifying Free Zone Person (QFZP) De-Minimis Rule",
        title_ar="الشخص المؤهل في المنطقة الحرة والحد الأدنى",
        content=(
            "A Qualifying Free Zone Person benefits from a 0% Corporate Tax rate on Qualifying Income provided that non-qualifying revenue "
            "does not exceed 5% of total revenue or AED 5,000,000, whichever is lower."
        ),
        category="CORPORATE_TAX",
        keywords=("qfzp", "free zone", "de-minimis", "0%", "qualifying income", "5,000,000"),
    ),
    GuidanceChunk(
        chunk_id="payroll-art-51-eosg",
        statutory_authority="Ministry of Human Resources and Emiratisation (MOHRE)",
        law_reference="Federal Decree-Law No. 33 of 2021, Article 51",
        title_en="End of Service Gratuity (EOSG) Statutory Calculation",
        title_ar="احتساب مكافأة نهاية الخدمة القانونية",
        content=(
            "A full-time employee who completes one or more years of continuous service is entitled to gratuity: "
            "21 days basic salary for each of the first 5 years; 30 days basic salary for each additional year thereafter. "
            "Total gratuity cannot exceed two years basic salary."
        ),
        category="PAYROLL",
        keywords=(
            "eosg",
            "gratuity",
            "severance",
            "end of service",
            "21 days",
            "30 days",
            "article 51",
        ),
    ),
    GuidanceChunk(
        chunk_id="cbuae-wps-sif",
        statutory_authority="Central Bank of the UAE & MOHRE",
        law_reference="CBUAE Circular No. 24/2019 - Wages Protection System",
        title_en="WPS SIF File Formatting & Routing Mandate",
        title_ar="تنسيق ملفات نظام حماية الأجور والاعتماد البنكي",
        content=(
            "Employers must remit salaries through WPS in standard SIF format with SCR header and EDR employee records. "
            "Salaries must be disbursed in AED through licensed bank routing codes within statutory deadlines."
        ),
        category="PAYROLL",
        keywords=("wps", "sif", "cbuae", "payroll", "salary", "scr", "edr", "iban"),
    ),
    GuidanceChunk(
        chunk_id="ifrs-16-leases",
        statutory_authority="International Accounting Standards Board (IASB)",
        law_reference="IFRS 16 Leases, Paragraphs 22-28",
        title_en="Right-of-Use (ROU) Asset and Lease Liability Initial Recognition",
        title_ar="الاعتراف الأولي بأصل حق الاستخدام والتزام عقد الإيجار",
        content=(
            "At commencement date, a lessee shall measure the lease liability at the present value of lease payments discounted "
            "at the interest rate implicit in the lease or lessee incremental borrowing rate, and recognize an equal ROU asset adjusted for prepayments."
        ),
        category="IFRS",
        keywords=(
            "ifrs 16",
            "lease",
            "rou asset",
            "lease liability",
            "discount rate",
            "amortization",
        ),
    ),
]
