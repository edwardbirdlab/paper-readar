import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone", // Enable standalone output for Docker
  webpack: (config, { isServer }) => {
    // Exclude canvas and encoding from client-side bundle
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;

    // Ignore node-specific modules in client bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        encoding: false,
      };
    }

    return config;
  },
};

export default withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
})(nextConfig);
