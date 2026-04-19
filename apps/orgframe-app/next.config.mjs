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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "jmihjlikdxfhdnuhypue.supabase.co",
        pathname: "/storage/v1/**"
      }
    ],
    minimumCacheTTL: 3600
  }

};

export default nextConfig;
