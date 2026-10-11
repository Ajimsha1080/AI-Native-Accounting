import { formatMoney } from './money.js';

export interface BilingualInvoicePrintData {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  supplierNameEn: string;
  supplierNameAr: string;
  supplierTrn: string;
  customerNameEn: string;
  customerNameAr: string;
  customerTrn: string;
  lines: {
    descriptionEn: string;
    descriptionAr: string;
    quantity: number;
    unitPriceFils: bigint;
    totalFils: bigint;
    vatAmountFils: bigint;
  }[];
  subtotalFils: bigint;
  vatTotalFils: bigint;
  grandTotalFils: bigint;
}

export class BilingualInvoiceDocumentGenerator {
  /**
   * Generates production-ready bilingual Arabic & English Tax Invoice HTML/PDF layout
   * compliant with FTA Article 59 Tax Invoice requirements.
   */
  static renderTaxInvoiceHtml(data: BilingualInvoicePrintData): string {
    const linesRows = data.lines
      .map(
        (l, idx) => `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td>${l.descriptionEn}<br/><span dir="rtl">${l.descriptionAr}</span></td>
          <td style="text-align: center;">${l.quantity}</td>
          <td style="text-align: right;">${formatMoney(l.unitPriceFils, 'AED')}</td>
          <td style="text-align: right;">${formatMoney(l.vatAmountFils, 'AED')}</td>
          <td style="text-align: right;">${formatMoney(l.totalFils, 'AED')}</td>
        </tr>`
      )
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TAX INVOICE / فاتورة ضريبية - ${data.invoiceNumber}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #333; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #004d40; padding-bottom: 20px; }
    .title { font-size: 24px; font-weight: bold; color: #004d40; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; margin-top: 25px; gap: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 30px; }
    th { background-color: #f0fdf4; border-bottom: 1px solid #cbd5e1; padding: 10px; font-size: 13px; }
    td { border-bottom: 1px solid #e2e8f0; padding: 10px; font-size: 13px; }
    .totals { margin-top: 30px; float: right; width: 350px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
    .grand-total { font-weight: bold; font-size: 16px; border-top: 2px solid #004d40; padding-top: 10px; color: #004d40; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">TAX INVOICE / فاتورة ضريبية</div>
      <div>Invoice #: <strong>${data.invoiceNumber}</strong></div>
      <div>Date: ${data.issueDate} | Due Date: ${data.dueDate}</div>
    </div>
    <div style="text-align: right;">
      <h3 style="margin: 0;">${data.supplierNameEn}</h3>
      <div dir="rtl" style="font-weight: bold;">${data.supplierNameAr}</div>
      <div>TRN / الرقم الضريبي: <strong>${data.supplierTrn}</strong></div>
    </div>
  </div>

  <div class="info-grid">
    <div>
      <strong>Billed To / فاتورة إلى:</strong><br/>
      ${data.customerNameEn}<br/>
      <span dir="rtl">${data.customerNameAr}</span><br/>
      TRN / الرقم الضريبي: <strong>${data.customerTrn}</strong>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Description / البيان</th>
        <th>Qty / الكمية</th>
        <th>Unit Price (AED) / سعر الوحدة</th>
        <th>VAT 5% (AED) / الضريبة</th>
        <th>Total (AED) / الإجمالي</th>
      </tr>
    </thead>
    <tbody>
      ${linesRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Subtotal / المجموع الفرعي:</span>
      <span>${formatMoney(data.subtotalFils, 'AED')} AED</span>
    </div>
    <div class="totals-row">
      <span>VAT (5%) / ضريبة القيمة المضافة:</span>
      <span>${formatMoney(data.vatTotalFils, 'AED')} AED</span>
    </div>
    <div class="totals-row grand-total">
      <span>Total Due / إجمالي المستحق:</span>
      <span>${formatMoney(data.grandTotalFils, 'AED')} AED</span>
    </div>
  </div>
</body>
</html>`.trim();
  }
}
