import { NextRequest } from 'next/server';
import { proxyToPythonBackend } from '@/lib/python-backend-proxy';

/**
 * Pure Next.js App Router Proxy Route:
 * Intercepts all /api and /api/* requests and forwards them directly to the
 * enterprise Python FastAPI backend.
 *
 * Guarantees zero Node.js business logic, strict single-source-of-truth in Python,
 * while preserving 100% frontend API contract compatibility.
 */

export async function GET(request: NextRequest) {
  return proxyToPythonBackend(request);
}

export async function POST(request: NextRequest) {
  return proxyToPythonBackend(request);
}

export async function PUT(request: NextRequest) {
  return proxyToPythonBackend(request);
}

export async function PATCH(request: NextRequest) {
  return proxyToPythonBackend(request);
}

export async function DELETE(request: NextRequest) {
  return proxyToPythonBackend(request);
}

export async function OPTIONS(request: NextRequest) {
  return proxyToPythonBackend(request);
}
