import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@warehouse/types', '@warehouse/api-client', '@warehouse/validators'],
}

export default nextConfig
