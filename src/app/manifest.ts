import type { MetadataRoute } from "next";
import { getAppBranding } from "@/lib/setup";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getAppBranding();

  return {
    name: branding.displayName,
    short_name: branding.displayName.slice(0, 12),
    description: branding.hasAteraBranding
      ? `Ticket operations dashboard for ${branding.displayName}`
      : "Ticketera ticket operations dashboard",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/pwa-icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa-icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}