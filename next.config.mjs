/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: false },
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
