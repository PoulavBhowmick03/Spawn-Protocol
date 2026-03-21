import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // viem does `await import('../../utils/ccip.js')` in call.js which webpack
    // splits into a separate async chunk that fails to load in Next.js.
    // Use module parser to make dynamic imports from viem eager (inlined).
    config.module.rules.push({
      test: /node_modules\/viem/,
      parser: {
        dynamicImportMode: "eager",
      },
    });
    return config;
  },
};

export default nextConfig;
