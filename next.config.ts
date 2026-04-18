import type { NextConfig } from "next";

// Security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy, ...) are
// set per-request by src/proxy.ts so that CSP can carry a fresh nonce for
// each response. This file only keeps build-time Next.js config.

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@prisma/client', 'pdfkit', 'qrcode', 'sharp'],
};

export default nextConfig;
