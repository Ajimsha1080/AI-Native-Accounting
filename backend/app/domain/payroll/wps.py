from datetime import date
from typing import Any


def calculate_article_51_eosg(
    basic_monthly_salary_fils: int, start_date: date, end_date: date
) -> dict[str, Any]:
    """
    Computes statutory UAE End of Service Gratuity (EOSG) under Article 51 of Federal Decree-Law No. 33 of 2021.
    All calculations operate in integer minor units (BigInt fils).
    Rules:
    - Less than 1 continuous year: 0 fils.
    - 1 to 5 years: 21 days' basic wage per year.
    - Over 5 years: 21 days for first 5 years + 30 days for each additional year.
    - Statutory Cap: Total gratuity cannot exceed 2 years' basic wage (24 months).
    """
    total_days = (end_date - start_date).days
    years = total_days / 365.25

    if years < 1.0:
        return {
            "tenure_years": round(years, 2),
            "gratuity_fils": 0,
            "statutory_cap_applied": False,
            "statutory_citation": "UAE Labour Law Article 51",
        }

    daily_wage_fils = basic_monthly_salary_fils // 30

    if years <= 5.0:
        payable_days = int(years * 21)
    else:
        payable_days = int((5.0 * 21) + ((years - 5.0) * 30))

    calculated_gratuity = payable_days * daily_wage_fils
    max_cap_fils = basic_monthly_salary_fils * 24

    final_gratuity = min(calculated_gratuity, max_cap_fils)
    cap_applied = calculated_gratuity > max_cap_fils

    return {
        "tenure_years": round(years, 2),
        "payable_days": payable_days,
        "daily_wage_fils": daily_wage_fils,
        "gratuity_fils": final_gratuity,
        "statutory_cap_applied": cap_applied,
        "statutory_citation": "UAE Labour Law Article 51 (Federal Decree-Law No. 33 of 2021)",
    }


def generate_wps_sif_file(
    employer_routing_code: str,
    employer_crn: str,
    salary_month: str,  # YYYY-MM
    employees: list[dict[str, Any]],
) -> str:
    """
    Generates UAE Central Bank / MoHRE Wages Protection System (WPS) SIF file.
    All salary amounts in integer fils formatted to standard 2 decimal places.
    """
    total_salary_fils = sum(int(e["total_salary_fils"]) for e in employees)
    total_count = len(employees)

    # Format header SCR record
    # Format: SCR,EmployerRoutingCode,EmployerCRN,FileCreationDate,FileCreationTime,SalaryMonth,TotalSalary,Count
    today = date.today().strftime("%Y%m%d")
    total_salary_aed = f"{total_salary_fils / 100:.2f}"
    header = f"SCR,{employer_routing_code},{employer_crn},{today},1200,{salary_month},{total_salary_aed},{total_count},AED\n"

    # Format employee EDR records
    # Format: EDR,EmployeeID,EmployeeRoutingCode,IBAN,StartDate,EndDate,DaysCount,FixedSalary,VariableSalary,LeaveDays
    rows = []
    for emp in employees:
        fixed_aed = f"{int(emp['fixed_salary_fils']) / 100:.2f}"
        var_aed = f"{int(emp.get('variable_salary_fils', 0)) / 100:.2f}"
        row = (
            f"EDR,{emp['person_id']},{emp['agent_code']},{emp['iban']},"
            f"{emp['start_date']},{emp['end_date']},{emp.get('days_count', 30)},"
            f"{fixed_aed},{var_aed},0"
        )
        rows.append(row)

    return header + "\n".join(rows) + "\n"
