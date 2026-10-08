const apiOrigin = process.env.API_ORIGIN || 'http://127.0.0.1:3001'

if (process.env.NODE_ENV === 'production' && !process.env.API_ORIGIN) {
  throw new Error('API_ORIGIN must point to the deployed API service in production.')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: process.cwd(),
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }]
  },
}

export default nextConfig