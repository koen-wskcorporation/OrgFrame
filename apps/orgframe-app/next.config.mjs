/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@orgframe/ui"],
  devIndicators: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb"
    }
  },
  images: {
    remotePatterns: []
  }

};

export default nextConfig;
