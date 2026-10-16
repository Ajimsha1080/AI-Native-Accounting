from datetime import date

from app.domain.payroll.wps import calculate_article_51_eosg, generate_wps_sif_file
from app.domain.taxation.vat201 import calculate_vat_201_return


def test_vat_201_standard_and_rcm_calculation():
    lines = [
        # Standard rated sales Dubai (5% VAT)
        {
            "id": "l-1",
            "direction": "CREDIT",
            "amount_fils": 10000000,
            "vat_rate": "SR_5",
            "vat_amount_fils": 500000,
            "emirate": "DUBAI",
        },
        # RCM Foreign Cloud Services (5% VAT)
        {
            "id": "l-2",
            "direction": "CREDIT",
            "amount_fils": 2000000,
            "vat_rate": "RCM_5",
            "vat_amount_fils": 100000,
        },
        # Standard rated input tax (Purchases)
        {
            "id": "l-3",
            "direction": "DEBIT",
            "amount_fils": 4000000,
            "vat_rate": "SR_5",
            "vat_amount_fils": 200000,
        },
        # RCM recoverable input tax
        {
            "id": "l-4",
            "direction": "DEBIT",
            "amount_fils": 2000000,
            "vat_rate": "RCM_5",
            "vat_amount_fils": 100000,
        },
    ]
    vat = calculate_vat_201_return(lines)

    # Box 1 Dubai Standard Sales
    assert vat["box1_emirates"]["DUBAI"]["amount_fils"] == 10000000
    assert vat["box1_emirates"]["DUBAI"]["vat_fils"] == 500000

    # Box 3 RCM output
    assert vat["box3_rcm_output"]["amount_fils"] == 2000000
    assert vat["box3_rcm_output"]["vat_fils"] == 100000

    # Box 8 Total Output Tax = 500,000 + 100,000 = 600,000 fils
    assert vat["box8_total_output_tax_fils"] == 600000

    # Box 11 Total Recoverable Input Tax = 200,000 + 100,000 = 300,000 fils
    assert vat["box11_total_recoverable_tax_fils"] == 300000

    # Box 12 Net Payable = 600,000 - 300,000 = 300,000 fils
    assert vat["box12_net_tax_payable_fils"] == 300000
    assert vat["verification_notice"] == "VERIFY WITH UAE TAX ADVISOR"


def test_article_51_eosg_gratuity_tiers_and_cap():
    # Scenario A: Tenure < 1 year -> 0
    res_under_1yr = calculate_article_51_eosg(
        basic_monthly_salary_fils=1000000,  # 10,000 AED
        start_date=date(2025, 6, 1),
        end_date=date(2025, 12, 1),
    )
    assert res_under_1yr["gratuity_fils"] == 0

    # Scenario B: 3 years tenure -> 21 days per year * 3 = 63 days
    # Daily wage = 10,000 / 30 = 333.33 AED = 33333 fils
    res_3yr = calculate_article_51_eosg(
        basic_monthly_salary_fils=3000000,  # 30,000 AED
        start_date=date(2023, 1, 1),
        end_date=date(2026, 1, 1),
    )
    assert res_3yr["payable_days"] == 63
    assert res_3yr["gratuity_fils"] == 63 * (3000000 // 30)
    assert res_3yr["statutory_cap_applied"] is False


def test_wps_sif_generation():
    employees = [
        {
            "person_id": "784198512345671",
            "agent_code": "CBUAE001",
            "iban": "AE290331234567890123456",
            "fixed_salary_fils": 1500000,
            "total_salary_fils": 1500000,
            "start_date": "2026-03-01",
            "end_date": "2026-03-31",
        }
    ]
    sif = generate_wps_sif_file("CBUAE001", "CRN-123", "2026-03", employees)
    assert sif.startswith("SCR,CBUAE001,CRN-123")
    assert "EDR,784198512345671" in sif
    assert "15000.00" in sif  # 1,500,000 fils = 15,000.00 AED
