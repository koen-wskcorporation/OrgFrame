/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@orgframe/ui"],
  devIndicators: false,
  images: {
    remotePatterns: []
  }

};

export default nextConfig;
