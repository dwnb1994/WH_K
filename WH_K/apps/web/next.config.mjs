/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@warehouse/types', '@warehouse/api-client', '@warehouse/validators'],
}

export default nextConfig
