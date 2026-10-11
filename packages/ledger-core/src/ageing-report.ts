import { UUID } from '@ledger-ae/shared-types';
import { formatMoney } from './money.js';

export interface OutstandingInvoice {
  invoiceId: UUID;
  customerOrVendorId: UUID;
  entityName: string;
  invoiceNumber: string;
  dueDate: string; // 'YYYY-MM-DD'
  totalAmountFils: bigint;
  unpaidBalanceFils: bigint;
  currency: string;
}

export interface AgeingBucketBreakdown {
  currentFils: bigint;      // 0 - 30 days
  days31To60Fils: bigint;   // 31 - 60 days
  days61To90Fils: bigint;   // 61 - 90 days
  days91PlusFils: bigint;   // 91+ days
  totalOutstandingFils: bigint;
  formattedTotalAed: string;
}

export interface CustomerAgeingSummary {
  customerOrVendorId: UUID;
  name: string;
  buckets: AgeingBucketBreakdown;
}

export interface AgeingReportResult {
  asOfDate: string;
  reportType: 'AR_AGEING' | 'AP_AGEING';
  customerSummaries: CustomerAgeingSummary[];
  grandTotalBuckets: AgeingBucketBreakdown;
}

export class AgeingReportGenerator {
  /**
   * Computes accounts receivable (AR) or accounts payable (AP) ageing buckets.
   * Standard brackets: Current (0-30), 31-60, 61-90, 91+ days past due.
   */
  static generateAgeingReport(
    asOfDateStr: string,
    reportType: 'AR_AGEING' | 'AP_AGEING',
    outstandingInvoices: OutstandingInvoice[]
  ): AgeingReportResult {
    const asOfDate = new Date(asOfDateStr).getTime();
    const customerMap = new Map<UUID, { name: string; invoices: OutstandingInvoice[] }>();

    for (const inv of outstandingInvoices) {
      let cust = customerMap.get(inv.customerOrVendorId);
      if (!cust) {
        cust = { name: inv.entityName, invoices: [] };
        customerMap.set(inv.customerOrVendorId, cust);
      }
      cust.invoices.push(inv);
    }

    let grandCurrent = 0n;
    let grand31To60 = 0n;
    let grand61To90 = 0n;
    let grand91Plus = 0n;

    const customerSummaries: CustomerAgeingSummary[] = [];

    for (const [id, data] of customerMap.entries()) {
      let current = 0n;
      let days31To60 = 0n;
      let days61To90 = 0n;
      let days91Plus = 0n;

      for (const inv of data.invoices) {
        const dueDate = new Date(inv.dueDate).getTime();
        const diffDays = Math.floor((asOfDate - dueDate) / (1000 * 60 * 60 * 24));

        if (diffDays <= 30) {
          current += inv.unpaidBalanceFils;
        } else if (diffDays <= 60) {
          days31To60 += inv.unpaidBalanceFils;
        } else if (diffDays <= 90) {
          days61To90 += inv.unpaidBalanceFils;
        } else {
          days91Plus += inv.unpaidBalanceFils;
        }
      }

      const totalCust = current + days31To60 + days61To90 + days91Plus;
      grandCurrent += current;
      grand31To60 += days31To60;
      grand61To90 += days61To90;
      grand91Plus += days91Plus;

      customerSummaries.push({
        customerOrVendorId: id,
        name: data.name,
        buckets: {
          currentFils: current,
          days31To60Fils: days31To60,
          days61To90Fils: days61To90,
          days91PlusFils: days91Plus,
          totalOutstandingFils: totalCust,
          formattedTotalAed: formatMoney(totalCust, 'AED')
        }
      });
    }

    const grandTotal = grandCurrent + grand31To60 + grand61To90 + grand91Plus;

    return {
      asOfDate: asOfDateStr,
      reportType,
      customerSummaries,
      grandTotalBuckets: {
        currentFils: grandCurrent,
        days31To60Fils: grand31To60,
        days61To90Fils: grand61To90,
        days91PlusFils: grand91Plus,
        totalOutstandingFils: grandTotal,
        formattedTotalAed: formatMoney(grandTotal, 'AED')
      }
    };
  }
}
