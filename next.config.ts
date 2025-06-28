import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Global API configuration
  experimental: {
    // Enable experimental features if needed
  },
  
  // Configure server options
  serverRuntimeConfig: {
    // Runtime config
  },
  
  // Public runtime config
  publicRuntimeConfig: {
    // Public config
  },
  
  // Custom webpack configuration for body-parser if needed
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Add any custom webpack configuration here
    return config;
  },
};

export default nextConfig;
