import { formatMoney } from '@ledger-ae/ledger-core';
import { parseDecimalToMinorUnits } from '@ledger-ae/shared-types';

export type InvoiceTypeCode = '380' | '381' | '383'; // 380 = Commercial Invoice, 381 = Credit Note, 383 = Debit Note

export interface PintaInvoiceParty {
  name: string;
  trn: string; // 15-digit UAE TRN
  streetName: string;
  city: string;
  emirate: string;
  countryCode: 'AE';
}

export interface PintaInvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceFils: bigint;
  lineExtensionAmountFils: bigint;
  vatRatePercent: number;
  vatAmountFils: bigint;
  taxCategoryCode: 'S' | 'Z' | 'E' | 'O'; // Standard, Zero, Exempt, Out of scope
}

export interface PintaInvoiceData {
  invoiceNumber: string;
  typeCode?: InvoiceTypeCode; // Default '380'
  originalInvoiceReference?: string; // Mandatory for Credit Notes (381)
  issueDate: string; // 'YYYY-MM-DD'
  currencyCode: 'AED' | string;
  supplier: PintaInvoiceParty;
  customer: PintaInvoiceParty;
  lines: PintaInvoiceLineItem[];
  subtotalFils: bigint;
  vatTotalFils: bigint;
  grandTotalFils: bigint;
}

/**
 * Generates OASIS UBL 2.1 XML conforming to the UAE Peppol PINT-AE specification.
 * Supports Commercial Invoices (380), Credit Notes (381), and Debit Notes (383).
 */
export function generateUblPintaXml(invoice: PintaInvoiceData): string {
  const typeCode = invoice.typeCode ?? '380';
  const rootElement = typeCode === '381' ? 'CreditNote' : 'Invoice';
  const lineElement = typeCode === '381' ? 'CreditNoteLine' : 'InvoiceLine';
  const quantityTag = typeCode === '381' ? 'CreditedQuantity' : 'InvoicedQuantity';

  const billingReferenceXml =
    typeCode === '381' && invoice.originalInvoiceReference
      ? `
    <cac:BillingReference>
        <cac:InvoiceDocumentReference>
            <cbc:ID>${invoice.originalInvoiceReference}</cbc:ID>
        </cac:InvoiceDocumentReference>
    </cac:BillingReference>`
      : '';

  const linesXml = invoice.lines
    .map(
      (line) => `
    <cac:${lineElement}>
        <cbc:ID>${line.id}</cbc:ID>
        <cbc:${quantityTag} unitCode="EA">${line.quantity}</cbc:${quantityTag}>
        <cbc:LineExtensionAmount currencyID="${invoice.currencyCode}">${formatMoney(line.lineExtensionAmountFils, invoice.currencyCode)}</cbc:LineExtensionAmount>
        <cac:TaxTotal>
            <cbc:TaxAmount currencyID="${invoice.currencyCode}">${formatMoney(line.vatAmountFils, invoice.currencyCode)}</cbc:TaxAmount>
        </cac:TaxTotal>
        <cac:Item>
            <cbc:Description>${line.description}</cbc:Description>
            <cac:ClassifiedTaxCategory>
                <cbc:ID>${line.taxCategoryCode}</cbc:ID>
                <cbc:Percent>${line.vatRatePercent}.00</cbc:Percent>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:ClassifiedTaxCategory>
        </cac:Item>
        <cac:Price>
            <cbc:PriceAmount currencyID="${invoice.currencyCode}">${formatMoney(line.unitPriceFils, invoice.currencyCode)}</cbc:PriceAmount>
        </cac:Price>
    </cac:${lineElement}>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<${rootElement} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${rootElement}-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    <cbc:CustomizationID>urn:peppol:pint:billing-1@ae-1</cbc:CustomizationID>
    <cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>
    <cbc:ID>${invoice.invoiceNumber}</cbc:ID>
    <cbc:IssueDate>${invoice.issueDate}</cbc:IssueDate>
    <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>${invoice.currencyCode}</cbc:DocumentCurrencyCode>${billingReferenceXml}

    <cac:AccountingSupplierParty>
        <cac:Party>
            <cac:PartyName>
                <cbc:Name>${invoice.supplier.name}</cbc:Name>
            </cac:PartyName>
            <cac:PostalAddress>
                <cbc:StreetName>${invoice.supplier.streetName}</cbc:StreetName>
                <cbc:CityName>${invoice.supplier.city}</cbc:CityName>
                <cbc:CountrySubentity>${invoice.supplier.emirate}</cbc:CountrySubentity>
                <cac:Country>
                    <cbc:IdentificationCode>AE</cbc:IdentificationCode>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>${invoice.supplier.trn}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
        </cac:Party>
    </cac:AccountingSupplierParty>

    <cac:AccountingCustomerParty>
        <cac:Party>
            <cac:PartyName>
                <cbc:Name>${invoice.customer.name}</cbc:Name>
            </cac:PartyName>
            <cac:PostalAddress>
                <cbc:StreetName>${invoice.customer.streetName}</cbc:StreetName>
                <cbc:CityName>${invoice.customer.city}</cbc:CityName>
                <cbc:CountrySubentity>${invoice.customer.emirate}</cbc:CountrySubentity>
                <cac:Country>
                    <cbc:IdentificationCode>AE</cbc:IdentificationCode>
                </cac:Country>
            </cac:PostalAddress>
            <cac:PartyTaxScheme>
                <cbc:CompanyID>${invoice.customer.trn}</cbc:CompanyID>
                <cac:TaxScheme>
                    <cbc:ID>VAT</cbc:ID>
                </cac:TaxScheme>
            </cac:PartyTaxScheme>
        </cac:Party>
    </cac:AccountingCustomerParty>

    <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${invoice.currencyCode}">${formatMoney(invoice.vatTotalFils, invoice.currencyCode)}</cbc:TaxAmount>
    </cac:TaxTotal>

    <cac:LegalMonetaryTotal>
        <cbc:LineExtensionAmount currencyID="${invoice.currencyCode}">${formatMoney(invoice.subtotalFils, invoice.currencyCode)}</cbc:LineExtensionAmount>
        <cbc:TaxExclusiveAmount currencyID="${invoice.currencyCode}">${formatMoney(invoice.subtotalFils, invoice.currencyCode)}</cbc:TaxExclusiveAmount>
        <cbc:TaxInclusiveAmount currencyID="${invoice.currencyCode}">${formatMoney(invoice.grandTotalFils, invoice.currencyCode)}</cbc:TaxInclusiveAmount>
        <cbc:PayableAmount currencyID="${invoice.currencyCode}">${formatMoney(invoice.grandTotalFils, invoice.currencyCode)}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>
${linesXml}
</${rootElement}>`.trim();
}

export interface ReceivedEInvoice {
  invoiceNumber: string;
  typeCode: InvoiceTypeCode;
  issueDate: string;
  supplierName: string;
  supplierTrn: string;
  customerTrn: string;
  currency: string;
  subtotalFils: bigint;
  vatTotalFils: bigint;
  grandTotalFils: bigint;
  lineItemsCount: number;
}

/**
 * Parses an incoming Peppol PINT-AE UBL 2.1 XML document received from Corner 3.
 */
export function parseReceivedUblPintaXml(xml: string): ReceivedEInvoice {
  const invMatch = xml.match(/<cbc:ID>([^<]+)<\/cbc:ID>/);
  const invoiceNumber = invMatch ? invMatch[1].trim() : 'UNKNOWN';

  const typeMatch = xml.match(/<cbc:InvoiceTypeCode>([^<]+)<\/cbc:InvoiceTypeCode>/);
  const typeCode = (typeMatch ? typeMatch[1].trim() : '380') as InvoiceTypeCode;

  const dateMatch = xml.match(/<cbc:IssueDate>([^<]+)<\/cbc:IssueDate>/);
  const issueDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString().slice(0, 10);

  const suppNameMatch = xml.match(/<cac:AccountingSupplierParty>[\s\S]*?<cbc:Name>([^<]+)<\/cbc:Name>/);
  const supplierName = suppNameMatch ? suppNameMatch[1].trim() : 'Supplier';

  const trnMatches = Array.from(xml.matchAll(/<cbc:CompanyID>([^<]+)<\/cbc:CompanyID>/g)).map((m) => m[1].trim());
  const supplierTrn = trnMatches.length > 0 ? trnMatches[0] : '';
  const customerTrn = trnMatches.length > 1 ? trnMatches[1] : '';

  const ccyMatch = xml.match(/<cbc:DocumentCurrencyCode>([^<]+)<\/cbc:DocumentCurrencyCode>/);
  const currency = ccyMatch ? ccyMatch[1].trim() : 'AED';

  const payableMatch = xml.match(/<cbc:PayableAmount[^>]*>([^<]+)<\/cbc:PayableAmount>/);
  const grandTotalFils = payableMatch ? parseDecimalToMinorUnits(payableMatch[1]) : 0n;

  const vatMatch = xml.match(/<cac:TaxTotal>[\s\S]*?<cbc:TaxAmount[^>]*>([^<]+)<\/cbc:TaxAmount>/);
  const vatTotalFils = vatMatch ? parseDecimalToMinorUnits(vatMatch[1]) : 0n;

  const subtotalFils = grandTotalFils - vatTotalFils;
  const lineMatches = Array.from(xml.matchAll(/<cac:(InvoiceLine|CreditNoteLine)>/g));

  return {
    invoiceNumber,
    typeCode,
    issueDate,
    supplierName,
    supplierTrn,
    customerTrn,
    currency,
    subtotalFils,
    vatTotalFils,
    grandTotalFils,
    lineItemsCount: lineMatches.length
  };
}
