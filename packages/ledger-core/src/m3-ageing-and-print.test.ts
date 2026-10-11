import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgeingReportGenerator,
  OutstandingInvoice
} from './ageing-report.js';
import {
  BilingualInvoiceDocumentGenerator,
  BilingualInvoicePrintData
} from './bilingual-invoice-pdf.js';

describe('Milestone 3: AR/AP Ageing Analysis & Bilingual Tax Invoice Rendering', () => {
  test('Calculates AR Ageing buckets correctly across 30, 60, 90, 90+ days', () => {
    // As of date: 2026-03-31
    const invoices: OutstandingInvoice[] = [
      {
        invoiceId: 'inv-1',
        customerOrVendorId: 'cust-emaar',
        entityName: 'Emaar Properties PJSC',
        invoiceNumber: 'INV-2026-001',
        dueDate: '2026-03-15', // 16 days ago -> 0 - 30 days
        totalAmountFils: 5000000n, // AED 50,000.00
        unpaidBalanceFils: 5000000n,
        currency: 'AED'
      },
      {
        invoiceId: 'inv-2',
        customerOrVendorId: 'cust-emaar',
        entityName: 'Emaar Properties PJSC',
        invoiceNumber: 'INV-2026-002',
        dueDate: '2026-02-10', // 49 days ago -> 31 - 60 days
        totalAmountFils: 3000000n, // AED 30,000.00
        unpaidBalanceFils: 3000000n,
        currency: 'AED'
      },
      {
        invoiceId: 'inv-3',
        customerOrVendorId: 'cust-damac',
        entityName: 'DAMAC Real Estate LLC',
        invoiceNumber: 'INV-2025-099',
        dueDate: '2025-12-01', // 120 days ago -> 91+ days
        totalAmountFils: 2000000n, // AED 20,000.00
        unpaidBalanceFils: 2000000n,
        currency: 'AED'
      }
    ];

    const report = AgeingReportGenerator.generateAgeingReport(
      '2026-03-31',
      'AR_AGEING',
      invoices
    );

    assert.equal(report.grandTotalBuckets.currentFils, 5000000n); // AED 50k
    assert.equal(report.grandTotalBuckets.days31To60Fils, 3000000n); // AED 30k
    assert.equal(report.grandTotalBuckets.days61To90Fils, 0n);
    assert.equal(report.grandTotalBuckets.days91PlusFils, 2000000n); // AED 20k
    assert.equal(report.grandTotalBuckets.totalOutstandingFils, 10000000n); // AED 100k
    assert.equal(report.grandTotalBuckets.formattedTotalAed, '100000.00');
  });

  test('Renders FTA Article 59 compliant bilingual Tax Invoice HTML layout', () => {
    const printData: BilingualInvoicePrintData = {
      invoiceNumber: 'TAX-INV-2026-001',
      issueDate: '2026-03-01',
      dueDate: '2026-03-31',
      supplierNameEn: 'Falcon Mainland Commercial LLC',
      supplierNameAr: 'شركة صقر التجارية ش.ذ.م.م',
      supplierTrn: '100234567800003',
      customerNameEn: 'Emaar Properties PJSC',
      customerNameAr: 'شركة إعمار العقارية ش.م.ع',
      customerTrn: '100987654321001',
      lines: [
        {
          descriptionEn: 'Enterprise Management Consulting',
          descriptionAr: 'استشارات إدارة المؤسسات',
          quantity: 1,
          unitPriceFils: 10000000n, // AED 100,000.00
          totalFils: 10000000n,
          vatAmountFils: 500000n // AED 5,000.00
        }
      ],
      subtotalFils: 10000000n,
      vatTotalFils: 500000n,
      grandTotalFils: 10500000n // AED 105,000.00
    };

    const html = BilingualInvoiceDocumentGenerator.renderTaxInvoiceHtml(printData);

    assert.match(html, /TAX INVOICE \/ فاتورة ضريبية/);
    assert.match(html, /100234567800003/);
    assert.match(html, /100987654321001/);
    assert.match(html, /Enterprise Management Consulting/);
    assert.match(html, /استشارات إدارة المؤسسات/);
    assert.match(html, /105000\.00 AED/);
  });
});
