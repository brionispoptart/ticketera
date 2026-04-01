"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginBranding = {
  displayName: string;
  homepageUrl: string | null;
  location: string | null;
  hasAteraBranding: boolean;
};

export function LoginForm({ branding }: { branding: LoginBranding }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; redirectTo?: string }
        | null;

      if (!response.ok) {
        setError(payload?.error || "Sign-in failed.");
        return;
      }

      router.replace(payload?.redirectTo || "/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="overflow-hidden border-zinc-800 bg-zinc-950/80 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm">
      <CardHeader className="space-y-2 border-b border-zinc-800/80 px-4 pb-4 pt-4 sm:space-y-3 sm:pb-6">
        <div className="inline-flex w-fit items-center rounded-full border border-lime-400/30 bg-lime-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-lime-300 sm:px-3 sm:text-[11px] sm:tracking-[0.24em]">
          {branding.hasAteraBranding ? "Atera Workspace" : "Technician Access"}
        </div>
        <div className="space-y-1.5 sm:space-y-2">
          <h1 className="text-[1.7rem] font-semibold tracking-tight text-zinc-50 sm:text-3xl">Sign in to {branding.displayName}</h1>
          {branding.hasAteraBranding ? (
            <div className="space-y-1.5 sm:space-y-2">
              <p className="max-w-md text-[13px] leading-5 text-cyan-100/90 sm:text-sm sm:leading-6">
                This workspace is for {branding.displayName} internal use only.
              </p>
              <p className="max-w-md text-[13px] leading-5 text-zinc-400 sm:text-sm sm:leading-6">
                If you&apos;re here by mistake,{" "}
                {branding.homepageUrl ? (
                  <a className="text-lime-300 underline decoration-lime-400/50 underline-offset-4 hover:text-lime-200" href={branding.homepageUrl} target="_blank" rel="noreferrer">
                    visit our homepage
                  </a>
                ) : (
                  <>please return to your organization&apos;s public website</>
                )}.
              </p>
              {branding.location ? <p className="max-w-md text-[10px] uppercase tracking-[0.16em] text-zinc-500 sm:text-xs sm:tracking-[0.18em]">{branding.location}</p> : null}
            </div>
          ) : (
            <p className="max-w-md text-[13px] leading-5 text-zinc-400 sm:text-sm sm:leading-6">Sign in with your technician credentials.</p>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-4 sm:pt-6">
        <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tech@company.com"
              required
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] leading-5 text-rose-200 sm:text-sm sm:leading-6">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full bg-lime-400 text-black hover:bg-lime-300" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
