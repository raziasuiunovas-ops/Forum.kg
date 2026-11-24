import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fonts for the Open Graph image route (/og) are read from disk at runtime
  outputFileTracingIncludes: {
    '/og': ['./assets/fonts/**'],
  },
  images: {
    domains: ['localhost'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          // HSTS: Only enable in production with HTTPS
          // Uncomment when deploying to production with HTTPS:
          // {
          //   key: 'Strict-Transport-Security',
          //   value: 'max-age=31536000; includeSubDomains',
          // },
        ],
      },
    ]
  },
}

export default nextConfig
