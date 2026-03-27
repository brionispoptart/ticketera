"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PASSWORD_REQUIREMENTS_TEXT } from "@/lib/auth/password-policy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null;

      if (!response.ok) {
        setError(payload?.error || "Password change failed.");
        return;
      }

      router.replace(payload?.redirectTo || "/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Password change failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950/80 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <CardHeader className="space-y-3 border-b border-zinc-800/80 pb-6">
        <div className="inline-flex w-fit items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-300">
          Required Step
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">Change your password</h1>
          <p className="max-w-md text-sm text-zinc-400">
            This account is using a temporary password. Set a permanent password before accessing the ticket dashboard.
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            <p className="text-xs text-zinc-500">{PASSWORD_REQUIREMENTS_TEXT}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full bg-lime-400 text-black hover:bg-lime-300" disabled={isSubmitting}>
            {isSubmitting ? "Updating password..." : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
