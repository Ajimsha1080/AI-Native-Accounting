import { NextRequest, NextResponse } from 'next/server';
import { resetInvoicesState } from '../../invoicing/route';
import { resetReconciliationState } from '../../banking/reconciliation/route';
import { resetProposalsState } from '../../ai/proposals/route';

export async function POST(_request: NextRequest) {
  resetInvoicesState();
  resetReconciliationState();
  resetProposalsState();
  return NextResponse.json({ ok: true, message: 'All mock state reset successfully' });
}

export async function GET(_request: NextRequest) {
  resetInvoicesState();
  resetReconciliationState();
  resetProposalsState();
  return NextResponse.json({ ok: true, message: 'All mock state reset successfully' });
}
