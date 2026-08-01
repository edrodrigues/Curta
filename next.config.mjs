/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"],
  },
};

export default nextConfig;