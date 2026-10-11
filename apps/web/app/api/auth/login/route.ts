import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, tenantSlug } = body;

    if (!email || !password || !tenantSlug) {
      return NextResponse.json(
        { error: 'Email, password, and tenant slug are required' },
        { status: 400 }
      );
    }

    // Authentication demo verification (OWASP ASVS L2 simulated verification)
    if (email === 'accountant@alnoor.ae' && password === 'Password@123') {
      return NextResponse.json({
        requires2FA: true,
        tempToken: 'temp_sess_token_2fa_alnoor_881920',
        userId: 'usr_chief_accountant_01',
        name: 'Tariq Al-Mansoor',
        email: 'accountant@alnoor.ae'
      });
    }

    return NextResponse.json(
      { error: 'Invalid credentials or organization not found' },
      { status: 401 }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
