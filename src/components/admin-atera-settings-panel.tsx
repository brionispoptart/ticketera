"use client";

import { type FormEvent, useEffect, useState } from "react";
import { KeyRound, RefreshCw, ShieldAlert, Trash2, Wifi } from "lucide-react";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AteraKeySettingsStatus = {
  source: "stored" | "environment" | "missing";
  hasStoredKey: boolean;
  hasEnvFallback: boolean;
  hasEncryptionKey: boolean;
  isStoredEncrypted: boolean;
  updatedAt: string | null;
  maskedValue: string | null;
  configurationError: string | null;
};

type BannerState = {
  type: "success" | "error" | "info";
  title: string;
  message: string;
};

type TestResponse = {
  message?: string;
  error?: string;
};

const REMOVE_CONFIRMATION_PHRASE = "REMOVE";

export function AdminAteraSettingsPanel() {
  const [status, setStatus] = useState<AteraKeySettingsStatus | null>(null);
  const [ateraApiKey, setAteraApiKey] = useState("");
  const [removeConfirmation, setRemoveConfirmation] = useState("");
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    void loadStatus();
  }, []);

  async function loadStatus() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/settings/atera-key", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { item?: AteraKeySettingsStatus; error?: string } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to load Atera settings.");
      }

      setStatus(payload.item);
    } catch (error) {
      setBanner({
        type: "error",
        title: "Failed to load Atera settings",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setBanner(null);

    try {
      const response = await fetch("/api/admin/settings/atera-key", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ateraApiKey }),
      });
      const payload = (await response.json().catch(() => null)) as { item?: AteraKeySettingsStatus; error?: string } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to update Atera API key.");
      }

      setAteraApiKey("");
      setStatus(payload.item);
      setBanner({
        type: "success",
        title: "Atera API key updated",
        message: "The stored Atera key has been encrypted and saved successfully.",
      });
    } catch (error) {
      setBanner({
        type: "error",
        title: "Atera key update failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTestConnection() {
    setIsTesting(true);
    setBanner(null);

    try {
      const response = await fetch("/api/admin/settings/atera-key", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as TestResponse | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to test the Atera connection.");
      }

      setBanner({
        type: "success",
        title: "Atera connection succeeded",
        message: payload?.message || "The stored key connected successfully.",
      });
    } catch (error) {
      setBanner({
        type: "error",
        title: "Atera connection failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsTesting(false);
    }
  }

  async function handleRemoveStoredKey() {
    if (!status?.hasStoredKey) {
      return;
    }

    if (removeConfirmation.trim().toUpperCase() !== REMOVE_CONFIRMATION_PHRASE) {
      setBanner({
        type: "error",
        title: "Confirmation phrase required",
        message: `Type ${REMOVE_CONFIRMATION_PHRASE} before removing the stored Atera key.`,
      });
      return;
    }

    setIsRemoving(true);
    setBanner(null);

    try {
      const response = await fetch("/api/admin/settings/atera-key", {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as { item?: AteraKeySettingsStatus; error?: string } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to remove the stored Atera key.");
      }

      setStatus(payload.item);
      setRemoveConfirmation("");
      setBanner({
        type: payload.item.hasEnvFallback ? "info" : "success",
        title: payload.item.hasEnvFallback ? "Stored key removed" : "Atera key removed",
        message: payload.item.hasEnvFallback
          ? "The encrypted database key was removed. The app is now using the environment fallback key."
          : "The encrypted database key was removed. A new key is now required before ticket APIs can be used again.",
      });
    } catch (error) {
      setBanner({
        type: "error",
        title: "Atera key removal failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <div>
      <div className="space-y-3">
        <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Admin Control</div>
        <AdminSectionNav current="settings" />
      </div>

      <div className="space-y-6 pt-3">
      {banner ? (
        <div className={`rounded-3xl border px-4 py-4 ${banner.type === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : banner.type === "success" ? "border-lime-500/30 bg-lime-500/10 text-lime-100" : "border-teal-500/30 bg-teal-500/10 text-teal-100"}`}>
          <div className="font-semibold">{banner.title}</div>
          <div className="mt-1 text-sm opacity-90">{banner.message}</div>
        </div>
      ) : null}

      <Card className="border-zinc-800 bg-zinc-950/80">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-zinc-50">
              <KeyRound className="h-5 w-5 text-lime-300" />
              Current key status
            </CardTitle>
            <CardDescription>View where the active key comes from and whether encrypted storage is available.</CardDescription>
          </div>
          <Button type="button" variant="outline" className="border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900" onClick={() => void loadStatus()} disabled={isLoading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatusTile label="Active source" value={status?.source || (isLoading ? "Loading..." : "Unknown")} />
          <StatusTile label="Masked key" value={status?.maskedValue || "Not configured"} />
          <StatusTile label="Encrypted storage" value={status?.hasEncryptionKey ? "Available" : "Missing secret"} />
          <StatusTile label="Last updated" value={status?.updatedAt ? new Date(status.updatedAt).toLocaleString() : "Not yet stored"} />
        </CardContent>
        {status?.hasEnvFallback ? (
          <CardContent className="pt-0">
            <div className="rounded-[20px] border border-teal-400/30 bg-teal-400/10 px-4 py-3 text-sm text-teal-100">
              Removing the stored key will not disable Atera access while `ATERA_API_KEY` is still set in the environment.
            </div>
          </CardContent>
        ) : null}
        {status?.configurationError ? (
          <CardContent className="pt-0">
            <div className="rounded-[20px] border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {status.configurationError}
            </div>
          </CardContent>
        ) : null}
      </Card>

      <Card className="border-zinc-800 bg-zinc-950/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-50">
            <KeyRound className="h-5 w-5 text-teal-300" />
            Rotate stored Atera API key
          </CardTitle>
          <CardDescription>
            Save a new encrypted key in the application database. If the app is currently using an environment fallback, saving here will move management into the admin panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="atera-api-key-rotation">New Atera API key</Label>
              <Input
                id="atera-api-key-rotation"
                type="password"
                autoComplete="off"
                value={ateraApiKey}
                onChange={(event) => setAteraApiKey(event.target.value)}
                placeholder="Paste the new Atera API key"
                required
              />
            </div>
            <Button type="submit" disabled={isSaving}>
              <KeyRound className="mr-2 h-4 w-4" />
              {isSaving ? "Saving key..." : "Save encrypted key"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-950/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-zinc-50">
            <ShieldAlert className="h-5 w-5 text-amber-300" />
            Connectivity and recovery
          </CardTitle>
          <CardDescription>
            Test the active key against Atera, or remove the stored database key to force a fresh key entry on the next setup flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button type="button" variant="outline" className="w-full border-zinc-700 bg-zinc-950/60 hover:bg-zinc-900 sm:w-auto" onClick={() => void handleTestConnection()} disabled={isTesting || isLoading || status?.source === "missing"}>
            <Wifi className="mr-2 h-4 w-4" />
            {isTesting ? "Testing connection..." : "Test Atera connection"}
          </Button>
        </CardContent>
        <CardContent className="grid gap-4 pt-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="remove-atera-key-confirmation">Type {REMOVE_CONFIRMATION_PHRASE} to enable stored key removal</Label>
            <Input
              id="remove-atera-key-confirmation"
              autoComplete="off"
              value={removeConfirmation}
              onChange={(event) => setRemoveConfirmation(event.target.value)}
              placeholder={REMOVE_CONFIRMATION_PHRASE}
              disabled={!status?.hasStoredKey || isRemoving}
            />
            <p className="text-sm text-zinc-400">
              {status?.hasEnvFallback
                ? "This removes the encrypted database key and switches the app back to the environment fallback."
                : "This removes the encrypted database key and forces a new Atera key to be entered before ticket APIs can be used again."}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20 lg:w-auto"
            onClick={() => void handleRemoveStoredKey()}
            disabled={isRemoving || !status?.hasStoredKey || removeConfirmation.trim().toUpperCase() !== REMOVE_CONFIRMATION_PHRASE}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isRemoving ? "Removing key..." : "Remove stored key"}
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-zinc-800 bg-black/30 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-zinc-100">{value}</div>
    </div>
  );
}