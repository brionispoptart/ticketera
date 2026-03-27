"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const buttonLabel = isSubmitting ? "Signing out" : "Sign out";

  async function handleLogout() {
    setIsSubmitting(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      router.replace("/login");
      router.refresh();
      setIsSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={`ticket-action-btn h-11 w-11 rounded-xl border-red-500/35 bg-red-500/10 text-red-200 hover:bg-red-500/16 hover:text-red-100${className ? ` ${className}` : ""}`}
      onClick={handleLogout}
      disabled={isSubmitting}
      aria-label={buttonLabel}
      title={buttonLabel}
    >
      <LogOut className="h-[17px] w-[17px] stroke-[2.05]" />
    </Button>
  );
}
