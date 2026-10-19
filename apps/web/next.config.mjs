import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@ledger-ae/shared-types',
    '@ledger-ae/ledger-core',
    '@ledger-ae/uae-tax-engine'
  ],
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: 'http://localhost:3000' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-tenant-id, x-entity-id' }
        ]
      }
    ];
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/en/login',
        permanent: false
      },
      {
        source: '/en',
        destination: '/en/login',
        permanent: false
      },
      {
        source: '/ar',
        destination: '/ar/login',
        permanent: false
      }
    ];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || 'http://127.0.0.1:8080';
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`
      }
    ];
  }
};

export default withNextIntl(nextConfig);
