import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MobileZoomLock } from "@/components/mobile-zoom-lock";
import { PwaRegister } from "@/components/pwa-register";
import { WorkspaceInboxBadge } from "@/components/workspace-inbox-badge";
import { getCurrentSession } from "@/lib/auth/server";
import { listUnreadChatConversationsForUser } from "@/lib/chat";
import { getAppBranding } from "@/lib/setup";
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
  const [branding, session] = await Promise.all([getAppBranding(), getCurrentSession()]);
  const unreadItems = session ? await listUnreadChatConversationsForUser(session.user.id) : [];
  const unreadCount = unreadItems.reduce((total, conversation) => total + conversation.unreadCount, 0);
  const showWorkspaceBadge = branding.hasAteraBranding || Boolean(session);
  const canOpenChat = Boolean(session && !session.user.mustChangePassword);

  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <MobileZoomLock />
        <PwaRegister />
        {showWorkspaceBadge ? (
          <div className="fixed right-4 top-4 z-50 max-[639px]:inset-x-3 max-[639px]:top-auto max-[639px]:right-auto max-[639px]:bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]">
            <WorkspaceInboxBadge
              initialUnreadCount={unreadCount}
              initialUnreadItems={unreadItems}
              interactive={canOpenChat}
            />
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
