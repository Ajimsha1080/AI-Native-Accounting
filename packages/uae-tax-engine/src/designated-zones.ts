export interface DesignatedZoneTransferInput {
  isSourceDesignatedZone: boolean;
  isDestinationDesignatedZone: boolean;
  areGoodsConsumedWithinZone: boolean;
  isCustomsPerimeterMaintained: boolean;
  invoiceValueFils: bigint;
}

export interface DesignatedZoneVatTreatment {
  isVatApplicable: boolean;
  vatRateBps: number;
  treatmentCode: 'OUT_OF_SCOPE' | 'STANDARD_5' | 'REVERSE_CHARGE_5';
  rationaleEn: string;
  rationaleAr: string;
  verifyWithTaxAdvisor: boolean;
  lawReference: string;
}

/**
 * Evaluates VAT treatment for movement of goods in UAE Designated Zones.
 * Reference: Cabinet Decision No. 59 of 2017 & FTA Public Clarification VATP033.
 */
export function evaluateDesignatedZoneGoodsSupply(
  input: DesignatedZoneTransferInput
): DesignatedZoneVatTreatment {
  // Case 1: Consumed within the zone (e.g. office supplies, internal use) -> Standard rated 5%
  if (input.areGoodsConsumedWithinZone) {
    return {
      isVatApplicable: true,
      vatRateBps: 500,
      treatmentCode: 'STANDARD_5',
      rationaleEn: 'Goods consumed within a designated zone are subject to standard 5% VAT.',
      rationaleAr: 'السلع المستهلكة داخل المنطقة المحددة تخضع لنسبة الضريبة الأساسية 5%.',
      verifyWithTaxAdvisor: false,
      lawReference: 'Cabinet Decision No. 59 of 2017, Article 2'
    };
  }

  // Case 2: Transfer between two Designated Zones with customs perimeter maintained -> Out of scope
  if (
    input.isSourceDesignatedZone &&
    input.isDestinationDesignatedZone &&
    input.isCustomsPerimeterMaintained
  ) {
    return {
      isVatApplicable: false,
      vatRateBps: 0,
      treatmentCode: 'OUT_OF_SCOPE',
      rationaleEn:
        'Transfer between Designated Zones under customs seal/guarantee is out of scope of UAE VAT.',
      rationaleAr: 'نقل السلع بين منطقتين محددتين تحت الضمان الجمركي يقع خارج نطاق الضريبة.',
      verifyWithTaxAdvisor: true,
      lawReference: 'Cabinet Decision No. 59 of 2017, Article 3 & FTA VATP033'
    };
  }

  // Case 3: Supply from Designated Zone to Mainland UAE -> Import (Reverse Charge or Customs VAT)
  if (input.isSourceDesignatedZone && !input.isDestinationDesignatedZone) {
    return {
      isVatApplicable: true,
      vatRateBps: 500,
      treatmentCode: 'REVERSE_CHARGE_5',
      rationaleEn:
        'Goods imported from a Designated Zone into the UAE mainland are subject to import VAT at border/RCM.',
      rationaleAr: 'توريد السلع من منطقة محددة إلى داخل الدولة يخضع لضريبة الاستيراد.',
      verifyWithTaxAdvisor: false,
      lawReference: 'Federal Decree-Law No. 8 of 2017, Article 48 & Article 50'
    };
  }

  // Default: Standard Rated Mainland Supply
  return {
    isVatApplicable: true,
    vatRateBps: 500,
    treatmentCode: 'STANDARD_5',
    rationaleEn: 'Standard supply of goods within UAE mainland.',
    rationaleAr: 'توريد سلع خاضع للضريبة بالنسبة الأساسية في الدولة.',
    verifyWithTaxAdvisor: false,
    lawReference: 'Federal Decree-Law No. 8 of 2017, Article 3'
  };
}
