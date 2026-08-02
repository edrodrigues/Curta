/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static"],
    // ffmpeg-static resolves its binary path dynamically (path.join(__dirname, "ffmpeg")),
    // so Next's output file tracing can't discover it via static analysis and drops it
    // from the deployed Vercel function, causing "spawn .../ffmpeg-static/ffmpeg ENOENT".
    outputFileTracingIncludes: {
      "/api/video/mix": ["./node_modules/ffmpeg-static/**"],
    },
  },
};

export default nextConfig;