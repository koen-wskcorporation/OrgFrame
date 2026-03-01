/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: []
  },
  experimental: {
    serverActions: {
      // File uploads are sent through server actions as multipart/form-data.
      // Raise the body limit so attachment forms do not fail with generic "Load failed".
      bodySizeLimit: "25mb"
    }
  }
};

export default nextConfig;
