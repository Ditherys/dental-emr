import type { NextConfig } from "next";

import {
  createBrowserHeaderRules,
  isHttpsDeploymentUrl,
} from "./src/lib/security/browser-policy";

const nextConfig: NextConfig = {
  async headers() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const appUrl = process.env.APP_URL;

    if (!supabaseUrl || !appUrl) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_URL and APP_URL are required to create the browser security policy.",
      );
    }

    return createBrowserHeaderRules({
      isHttpsDeployment: isHttpsDeploymentUrl(appUrl),
      isProduction: process.env.NODE_ENV === "production",
      supabaseUrl,
    }).map(({ source, headers }) => ({
      source,
      headers: [...headers],
    }));
  },
};

export default nextConfig;
