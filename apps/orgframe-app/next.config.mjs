/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@orgframe/ui"],
  devIndicators: false,
  allowedDevOrigins: ["orgframe.test", "*.orgframe.test"],
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb"
    },
    staleTimes: {
      dynamic: 300,
      static: 1800
    }
  },
  images: {
    remotePatterns: []
  }

};

export default nextConfig;
