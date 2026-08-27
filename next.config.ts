import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Served at madarorbit.com/membership, behind Caddy, beside the static
  // marketing site (nginx:8080) and the staff CRM (:3200).
  basePath: "/membership",
  output: "standalone",
};

export default nextConfig;
