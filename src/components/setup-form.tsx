"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { PASSWORD_REQUIREMENTS_TEXT } from "@/lib/auth/password-policy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SetupForm({ needsAdminCreation }: { needsAdminCreation: boolean }) {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ateraApiKey, setAteraApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName,
          lastName,
          employeeId,
          email,
          password,
          confirmPassword,
          ateraApiKey,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null;

      if (!response.ok) {
        setError(payload?.error || "Setup failed.");
        return;
      }

      router.replace(payload?.redirectTo || "/login");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Setup failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950/80 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <CardHeader className="space-y-3 border-b border-zinc-800/80 pb-6">
        <div className="inline-flex w-fit items-center rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-lime-300">
          First Run Setup
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">Create the owner account</h1>
          <p className="max-w-md text-sm text-zinc-400">
            Finish one-time setup by creating the initial admin account and saving the Atera API key used for ticket access.
          </p>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          {needsAdminCreation ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="first-name">First name</Label>
                  <Input id="first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required={needsAdminCreation} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last-name">Last name</Label>
                  <Input id="last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required={needsAdminCreation} />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employee-id">Employee ID</Label>
                  <Input id="employee-id" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} placeholder="ADMIN-0001" required={needsAdminCreation} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required={needsAdminCreation} />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required={needsAdminCreation} />
                  <p className="text-xs text-zinc-500">{PASSWORD_REQUIREMENTS_TEXT}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm password</Label>
                  <Input id="confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required={needsAdminCreation} />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-4 text-sm text-zinc-300">
              An admin account already exists. Finish setup by saving the Atera API key for server-side ticket access.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="atera-api-key">Atera API key</Label>
            <Input
              id="atera-api-key"
              type="password"
              autoComplete="off"
              value={ateraApiKey}
              onChange={(event) => setAteraApiKey(event.target.value)}
              placeholder="Paste your Atera API key"
              required
            />
            <p className="text-xs text-zinc-500">This is stored by the app so server-side ticket requests can reach Atera.</p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full bg-lime-400 text-black hover:bg-lime-300" disabled={isSubmitting}>
            {isSubmitting ? "Saving setup..." : "Complete setup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}