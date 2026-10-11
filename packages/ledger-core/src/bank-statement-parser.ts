import { UUID } from '@ledger-ae/shared-types';

export enum StatementFormat {
  CSV = 'CSV',
  MT940 = 'MT940',
  CAMT053 = 'CAMT053'
}

export interface BankStatementLine {
  id: UUID;
  bankAccountId: UUID;
  transactionDate: string; // ISO 'YYYY-MM-DD'
  bookingDate: string;
  amountFils: bigint;      // minor units
  currency: string;
  direction: 'DEBIT' | 'CREDIT'; // DEBIT = money out, CREDIT = money in
  reference: string;
  narrative: string;
  counterpartyIban?: string;
  counterpartyName?: string;
}

export class BankStatementParser {
  /**
   * Parses UAE Bank CSV Statement format (standard corporate export from ENBD, FAB, ADCB).
   * Expects columns: Date, Description, Reference, Inflow, Outflow
   */
  static parseUaeBankCsv(
    csvContent: string,
    bankAccountId: UUID,
    currency: string = 'AED'
  ): BankStatementLine[] {
    const lines = csvContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) return [];

    const result: BankStatementLine[] = [];
    const rows = lines.slice(1);

    for (let i = 0; i < rows.length; i++) {
      const parts = rows[i].split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 5) continue;

      const [date, description, reference, inflowStr, outflowStr] = parts;
      const inflowFils = inflowStr ? BigInt(Math.round(parseFloat(inflowStr) * 100)) : 0n;
      const outflowFils = outflowStr ? BigInt(Math.round(parseFloat(outflowStr) * 100)) : 0n;

      if (inflowFils > 0n) {
        result.push({
          id: `csv-${bankAccountId}-${i}-in`,
          bankAccountId,
          transactionDate: date,
          bookingDate: date,
          amountFils: inflowFils,
          currency,
          direction: 'CREDIT',
          reference: reference || 'N/A',
          narrative: description
        });
      } else if (outflowFils > 0n) {
        result.push({
          id: `csv-${bankAccountId}-${i}-out`,
          bankAccountId,
          transactionDate: date,
          bookingDate: date,
          amountFils: outflowFils,
          currency,
          direction: 'DEBIT',
          reference: reference || 'N/A',
          narrative: description
        });
      }
    }

    return result;
  }

  /**
   * Parses SWIFT MT940 Bank Statement format.
   * Standard tags: :20:, :25:, :28C:, :60F:, :61:, :86:, :62F:
   */
  static parseMt940(
    content: string,
    bankAccountId: UUID,
    defaultCurrency: string = 'AED'
  ): BankStatementLine[] {
    const result: BankStatementLine[] = [];
    const lines = content.split(/\r?\n/).map((l) => l.trim());

    let currentCurrency = defaultCurrency;
    let pendingLine61: {
      date: string;
      direction: 'DEBIT' | 'CREDIT';
      amountFils: bigint;
      reference: string;
    } | null = null;
    let lineIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Tag :60F: or :62F: contains 3-letter currency code (e.g. :60F:C260101AED1000000,00)
      if (line.startsWith(':60F:') || line.startsWith(':62F:')) {
        const ccyMatch = line.slice(5).match(/[A-Z]{3}/);
        if (ccyMatch) {
          currentCurrency = ccyMatch[0];
        }
      }

      // Tag :61: Statement Line
      // Format: :61:YYMMDD[MMDD]D/C/RC/RD[FundsCode]Amount,Dec[NType]Ref[//SubRef]
      if (line.startsWith(':61:')) {
        // Flush previous pending line if no tag 86 followed
        if (pendingLine61) {
          lineIdx++;
          result.push({
            id: `mt940-${bankAccountId}-${lineIdx}`,
            bankAccountId,
            transactionDate: pendingLine61.date,
            bookingDate: pendingLine61.date,
            amountFils: pendingLine61.amountFils,
            currency: currentCurrency,
            direction: pendingLine61.direction,
            reference: pendingLine61.reference,
            narrative: pendingLine61.reference
          });
          pendingLine61 = null;
        }

        const tagContent = line.slice(4).trim();
        // Format: YYMMDD[MMDD]D/C/RC/RD[FundsCode]Amount,Dec[NType]Ref[//SubRef]
        const m61 = tagContent.match(
          /^(\d{6})(\d{4})?(CR|DR|RC|RD|C|D)([A-Z])?([0-9]+[,\.][0-9]{2})([A-Z]{4})?([^\r\n]*)$/
        );

        let isoDate = new Date().toISOString().slice(0, 10);
        let direction: 'DEBIT' | 'CREDIT' = 'CREDIT';
        let amountFils = 0n;
        let ref = 'MT940-REF';

        if (m61) {
          const yy = m61[1].slice(0, 2);
          const mm = m61[1].slice(2, 4);
          const dd = m61[1].slice(4, 6);
          isoDate = `20${yy}-${mm}-${dd}`;

          const dirCode = m61[3];
          if (dirCode === 'CR' || dirCode === 'C' || dirCode === 'RD') {
            direction = 'CREDIT';
          } else {
            direction = 'DEBIT';
          }

          const amtStr = m61[5].replace(',', '.');
          amountFils = BigInt(Math.round(parseFloat(amtStr) * 100));

          const rawRef = m61[7] ? m61[7].trim() : '';
          const subRefMatch = rawRef.match(/\/\/([^\r\n]+)/);
          if (subRefMatch) {
            ref = subRefMatch[1].trim();
          } else if (rawRef.length > 0) {
            ref = rawRef;
          }
        } else {
          // Fallback simple extraction
          const amtMatch = tagContent.match(/([0-9]+[,\.][0-9]{2})/);
          if (amtMatch) {
            amountFils = BigInt(Math.round(parseFloat(amtMatch[1].replace(',', '.')) * 100));
          }
        }

        pendingLine61 = {
          date: isoDate,
          direction,
          amountFils,
          reference: ref
        };
      }

      // Tag :86: Information to Account Owner (Narrative)
      if (line.startsWith(':86:') && pendingLine61) {
        lineIdx++;
        const narrative = line.slice(4).trim();
        result.push({
          id: `mt940-${bankAccountId}-${lineIdx}`,
          bankAccountId,
          transactionDate: pendingLine61.date,
          bookingDate: pendingLine61.date,
          amountFils: pendingLine61.amountFils,
          currency: currentCurrency,
          direction: pendingLine61.direction,
          reference: pendingLine61.reference,
          narrative
        });
        pendingLine61 = null;
      }
    }

    // Flush final line if pending
    if (pendingLine61) {
      lineIdx++;
      result.push({
        id: `mt940-${bankAccountId}-${lineIdx}`,
        bankAccountId,
        transactionDate: pendingLine61.date,
        bookingDate: pendingLine61.date,
        amountFils: pendingLine61.amountFils,
        currency: currentCurrency,
        direction: pendingLine61.direction,
        reference: pendingLine61.reference,
        narrative: pendingLine61.reference
      });
    }

    return result;
  }

  /**
   * Parses ISO 20022 CAMT.053 XML Statement format.
   */
  static parseCamt053(
    xmlContent: string,
    bankAccountId: UUID,
    defaultCurrency: string = 'AED'
  ): BankStatementLine[] {
    const result: BankStatementLine[] = [];

    // Extract each <Ntry> block
    const ntryRegex = /<Ntry>([\s\S]*?)<\/Ntry>/g;
    let match: RegExpExecArray | null;
    let idx = 0;

    while ((match = ntryRegex.exec(xmlContent)) !== null) {
      idx++;
      const block = match[1];

      // Amount and Currency: <Amt Ccy="AED">75000.00</Amt>
      const amtMatch = block.match(/<Amt\s+Ccy="([^"]+)">([^<]+)<\/Amt>/);
      const currency = amtMatch ? amtMatch[1] : defaultCurrency;
      const amountVal = amtMatch ? parseFloat(amtMatch[2]) : 0;
      const amountFils = BigInt(Math.round(amountVal * 100));

      // Direction: <CdtDbtInd>CRDT</CdtDbtInd> (or DBIT)
      const dirMatch = block.match(/<CdtDbtInd>([^<]+)<\/CdtDbtInd>/);
      const isCredit = dirMatch ? dirMatch[1].trim() === 'CRDT' : true;
      const direction: 'DEBIT' | 'CREDIT' = isCredit ? 'CREDIT' : 'DEBIT';

      // Date: <BookgDt><Dt>2026-03-01</Dt></BookgDt>
      const dateMatch = block.match(/<BookgDt>\s*<Dt>([^<]+)<\/Dt>/);
      const bookingDate = dateMatch ? dateMatch[1].trim() : new Date().toISOString().slice(0, 10);

      // Reference: <EndToEndId>INV-2026-0042</EndToEndId>
      const refMatch = block.match(/<EndToEndId>([^<]+)<\/EndToEndId>/);
      const reference = refMatch ? refMatch[1].trim() : `CAMT-REF-${idx}`;

      // Narrative: <Ustrd>Description</Ustrd>
      const narMatch = block.match(/<Ustrd>([^<]+)<\/Ustrd>/);
      const narrative = narMatch ? narMatch[1].trim() : 'CAMT053 Transaction';

      // Counterparty Name
      const cptyMatch = block.match(/<Nm>([^<]+)<\/Nm>/);
      const counterpartyName = cptyMatch ? cptyMatch[1].trim() : undefined;

      result.push({
        id: `camt053-${bankAccountId}-${idx}`,
        bankAccountId,
        transactionDate: bookingDate,
        bookingDate,
        amountFils,
        currency,
        direction,
        reference,
        narrative,
        counterpartyName
      });
    }

    return result;
  }
}
