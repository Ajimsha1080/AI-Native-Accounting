import { NextRequest, NextResponse } from 'next/server';

const BACKEND_BASE_URL = process.env.BACKEND_API_URL || 'http://127.0.0.1:8000';

/**
 * Enterprise Proxy Forwarder:
 * Forwards frontend requests from Next.js to the pure Python FastAPI backend.
 * Guarantees zero business logic in Node.js while preserving all frontend contracts,
 * session cookies, CORS headers, and status codes.
 */
export async function proxyToPythonBackend(request: NextRequest): Promise<NextResponse> {
  const targetUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, BACKEND_BASE_URL);

  const headers = new Headers(request.headers);
  // Forward host correctly and strip original host header to allow target resolution
  const clientHost = request.headers.get('host') || 'localhost:3005';
  headers.set('X-Forwarded-Host', clientHost);
  headers.set('X-Forwarded-Proto', 'http');
  headers.delete('host');

  // In development, supply default tenant and user context if not authenticated
  const cookieHeader = request.headers.get('cookie') || '';
  if (!headers.has('authorization') && !cookieHeader.includes('ledger_session')) {
    if (!headers.has('x-tenant-id')) {
      headers.set('x-tenant-id', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    }
    if (!headers.has('x-user-id')) {
      headers.set('x-user-id', '00000000-0000-0000-0000-000000000001');
    }
  }

  const forwardHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    forwardHeaders[key] = value;
  });
  console.log('[PROXY FORWARD]', targetUrl.toString(), 'x-tenant-id:', forwardHeaders['x-tenant-id']);

  const method = request.method.toUpperCase();
  const init: RequestInit = {
    method,
    headers: forwardHeaders,
    redirect: 'manual'
  };

  if (method !== 'GET' && method !== 'HEAD') {
    try {
      const body = await request.arrayBuffer();
      if (body.byteLength > 0) {
        init.body = body;
      }
    } catch {
      // Body already read or empty
    }
  }

  try {
    const upstreamRes = await fetch(targetUrl.toString(), init);

    const responseHeaders = new Headers(upstreamRes.headers);
    // Strip hop-by-hop headers if needed
    responseHeaders.delete('content-encoding');

    const resBody = await upstreamRes.arrayBuffer();
    return new NextResponse(resBody, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: responseHeaders
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        code: 'BACKEND_UNAVAILABLE',
        message: `FastAPI Python backend unavailable at ${BACKEND_BASE_URL}: ${err.message}`
      },
      { status: 503 }
    );
  }
}
