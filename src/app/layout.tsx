import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MobileZoomLock } from "@/components/mobile-zoom-lock";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getAppBranding();
  const pwaEnabled = false;

  return {
    applicationName: branding.displayName,
    title: branding.displayName,
    description: branding.hasAteraBranding
      ? `Ticket operations dashboard for ${branding.displayName}`
      : "Ticketera ticket operations dashboard",
    formatDetection: {
      telephone: false,
    },
    ...(pwaEnabled ? {
      manifest: "/manifest.webmanifest",
      appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent" as const,
        title: branding.displayName,
      },
    } : {}),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <MobileZoomLock />
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
