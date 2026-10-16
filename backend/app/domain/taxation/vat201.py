from typing import Any, TypedDict

EMIRATES = ["ABU_DHABI", "DUBAI", "SHARJAH", "AJMAN", "UMM_AL_QUWAIN", "RAS_AL_KHAIMAH", "FUJAIRAH"]


class BoxData(TypedDict):
    amount_fils: int
    vat_fils: int
    line_ids: list[str]


def calculate_vat_201_return(lines: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Computes statutory 14-box UAE VAT 201 Return from posted journal lines.
    Statutory Authority: UAE Federal Decree-Law No. 8 of 2017 on Value Added Tax.
    Every figure operates in integer minor units (BigInt fils).
    """
    # Box 1: Standard Rated Supplies per Emirate
    emirate_boxes: dict[str, BoxData] = {
        e: {"amount_fils": 0, "vat_fils": 0, "line_ids": []} for e in EMIRATES
    }

    # Other boxes
    box2: BoxData = {"amount_fils": 0, "vat_fils": 0, "line_ids": []}
    box3: BoxData = {"amount_fils": 0, "vat_fils": 0, "line_ids": []}  # RCM output
    box4: BoxData = {"amount_fils": 0, "vat_fils": 0, "line_ids": []}  # Zero-rated
    box5: BoxData = {"amount_fils": 0, "vat_fils": 0, "line_ids": []}  # Exempt
    box6: BoxData = {"amount_fils": 0, "vat_fils": 0, "line_ids": []}  # Customs import
    box7: BoxData = {"amount_fils": 0, "vat_fils": 0, "line_ids": []}  # Customs adjustments

    box9: BoxData = {"amount_fils": 0, "vat_fils": 0, "line_ids": []}  # Standard input VAT
    box10: BoxData = {"amount_fils": 0, "vat_fils": 0, "line_ids": []}  # RCM input VAT

    for line in lines:
        amount = int(line.get("amount_fils", 0))
        vat = int(line.get("vat_amount_fils", 0))
        rate = str(line.get("vat_rate", "")).upper()
        direction = str(line.get("direction", "")).upper()
        emirate = str(line.get("emirate", "DUBAI")).upper()
        line_id = str(line.get("id", ""))

        if direction == "CREDIT":  # Sales / Output
            if rate == "SR_5":
                target_em = emirate if emirate in emirate_boxes else "DUBAI"
                emirate_boxes[target_em]["amount_fils"] += amount
                emirate_boxes[target_em]["vat_fils"] += vat
                emirate_boxes[target_em]["line_ids"].append(line_id)
            elif rate == "RCM_5":
                box3["amount_fils"] += amount
                box3["vat_fils"] += vat
                box3["line_ids"].append(line_id)
            elif rate in ("ZR_0", "ZR_EXP_0", "ZR_LOC_0"):
                box4["amount_fils"] += amount
                box4["line_ids"].append(line_id)
            elif rate in ("EX_0", "EX_FIN"):
                box5["amount_fils"] += amount
                box5["line_ids"].append(line_id)

        elif direction == "DEBIT":  # Purchases / Input Tax
            if rate == "SR_5":
                box9["amount_fils"] += amount
                box9["vat_fils"] += vat
                box9["line_ids"].append(line_id)
            elif rate == "RCM_5":
                box10["amount_fils"] += amount
                box10["vat_fils"] += vat
                box10["line_ids"].append(line_id)

    total_box1_amount = sum(b["amount_fils"] for b in emirate_boxes.values())
    total_box1_vat = sum(b["vat_fils"] for b in emirate_boxes.values())

    # Box 8: Total Output Tax Due
    box8_total_output_vat = (
        total_box1_vat + box2["vat_fils"] + box3["vat_fils"] + box6["vat_fils"] + box7["vat_fils"]
    )

    # Box 11: Total Recoverable Tax
    box11_total_input_vat = box9["vat_fils"] + box10["vat_fils"]

    # Box 12: Net Payable or Reclaimable Tax (Box 8 - Box 11)
    box12_net_tax = box8_total_output_vat - box11_total_input_vat

    return {
        "box1_emirates": emirate_boxes,
        "box1_total_amount_fils": total_box1_amount,
        "box1_total_vat_fils": total_box1_vat,
        "box2_tourist_refund": box2,
        "box3_rcm_output": box3,
        "box4_zero_rated": box4,
        "box5_exempt": box5,
        "box6_customs_imports": box6,
        "box7_customs_adjustments": box7,
        "box8_total_output_tax_fils": box8_total_output_vat,
        "box9_standard_expenses": box9,
        "box10_rcm_expenses": box10,
        "box11_total_recoverable_tax_fils": box11_total_input_vat,
        "box12_net_tax_payable_fils": box12_net_tax,
        "requires_advisor_verification": True,
        "verification_notice": "VERIFY WITH UAE TAX ADVISOR",
    }
