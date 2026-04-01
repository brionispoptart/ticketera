"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, KeyRound, Plus, Save, ShieldCheck, UserRoundCog } from "lucide-react";
import { PASSWORD_REQUIREMENTS_TEXT } from "@/lib/auth/password-policy";
import { AdminSectionNav } from "@/components/admin-section-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UserColorChip } from "@/components/user-color-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ManagedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  avatarUrl: string | null;
  technicianLevel: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type UserFormState = {
  email: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  avatarUrl: string;
  technicianLevel: string;
  role: string;
  isActive: boolean;
};

type BannerState = {
  type: "success" | "error" | "info";
  title: string;
  message: string;
  temporaryPassword?: string;
};

const EMPTY_FORM: UserFormState = {
  email: "",
  firstName: "",
  lastName: "",
  employeeId: "",
  avatarUrl: "",
  technicianLevel: "L1",
  role: "TECHNICIAN",
  isActive: true,
};

const ROLE_OPTIONS = ["TECHNICIAN", "ADMIN"];
const LEVEL_OPTIONS = ["L1", "L2", "L3", "LEAD"];

function toFormState(user?: ManagedUser | null): UserFormState {
  if (!user) {
    return EMPTY_FORM;
  }

  return {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    employeeId: user.employeeId,
    avatarUrl: user.avatarUrl || "",
    technicianLevel: user.technicianLevel,
    role: user.role,
    isActive: user.isActive,
  };
}

function sortUsers(items: ManagedUser[]) {
  return items.slice().sort((a, b) => {
    if (a.role !== b.role) {
      return a.role.localeCompare(b.role);
    }
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  });
}

export function AdminUsersPanel({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<UserFormState>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<UserFormState>(EMPTY_FORM);
  const [temporaryPasswordOverride, setTemporaryPasswordOverride] = useState("");
  const [resetPasswordOverride, setResetPasswordOverride] = useState("");
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [selectedUserId, users],
  );

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    setEditForm(toFormState(selectedUser));
  }, [selectedUser]);

  async function loadUsers() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { items?: ManagedUser[]; error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load users.");
      }

      const items = sortUsers(payload?.items || []);
      setUsers(items);
      setSelectedUserId((current) => current && items.some((item) => item.id === current) ? current : items[0]?.id || null);
    } catch (error) {
      setBanner({
        type: "error",
        title: "Failed to load technician accounts",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }

  function updateCreateForm(patch: Partial<UserFormState>) {
    setCreateForm((current) => ({ ...current, ...patch }));
  }

  function updateEditForm(patch: Partial<UserFormState>) {
    setEditForm((current) => ({ ...current, ...patch }));
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setBanner(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          password: temporaryPasswordOverride || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; item?: ManagedUser; temporaryPassword?: string; error?: string }
        | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to create user.");
      }

      const nextUsers = sortUsers([payload.item, ...users]);
      setUsers(nextUsers);
      setCreateForm(EMPTY_FORM);
      setTemporaryPasswordOverride("");
      setSelectedUserId(payload.item.id);
      setBanner({
        type: "success",
        title: "User created",
        message: `Created ${payload.item.firstName} ${payload.item.lastName} (${payload.item.email}).`,
        temporaryPassword: payload.temporaryPassword,
      });
    } catch (error) {
      setBanner({
        type: "error",
        title: "Create user failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    setIsSaving(true);
    setBanner(null);

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = (await response.json().catch(() => null)) as { item?: ManagedUser; error?: string } | null;

      if (!response.ok || !payload?.item) {
        throw new Error(payload?.error || "Failed to update user.");
      }

      const nextUsers = sortUsers(users.map((user) => (user.id === payload.item?.id ? payload.item : user)));
      setUsers(nextUsers);
      setSelectedUserId(payload.item.id);
      setBanner({
        type: "success",
        title: "User updated",
        message: `Saved changes for ${payload.item.firstName} ${payload.item.lastName}.`,
      });
    } catch (error) {
      setBanner({
        type: "error",
        title: "Update user failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) {
      return;
    }

    setIsResetting(true);
    setBanner(null);

    try {
      const response = await fetch(`/api/admin/users/${selectedUser.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPasswordOverride || undefined }),
      });
      const payload = (await response.json().catch(() => null)) as { temporaryPassword?: string; error?: string } | null;

      if (!response.ok || !payload?.temporaryPassword) {
        throw new Error(payload?.error || "Failed to reset password.");
      }

      setResetPasswordOverride("");
      await loadUsers();
      setBanner({
        type: "success",
        title: "Password reset",
        message: `A new temporary password was issued for ${selectedUser.email}.`,
        temporaryPassword: payload.temporaryPassword,
      });
    } catch (error) {
      setBanner({
        type: "error",
        title: "Password reset failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <div>
      <div className="space-y-3">
        <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Admin Control</div>
        <AdminSectionNav current="users" />
      </div>

      <div className="space-y-6 pt-3">
      {banner ? (
        <div className={`rounded-3xl border px-4 py-4 ${banner.type === "error" ? "border-rose-500/30 bg-rose-500/10 text-rose-100" : banner.type === "success" ? "border-lime-500/30 bg-lime-500/10 text-lime-100" : "border-teal-500/30 bg-teal-500/10 text-teal-100"}`}>
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div className="space-y-1">
              <div className="font-semibold">{banner.title}</div>
              <div className="text-sm opacity-90">{banner.message}</div>
              {banner.temporaryPassword ? (
                <div className="mt-3 rounded-2xl border border-current/20 bg-black/20 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] opacity-70">Temporary password</div>
                  <div className="mt-1 break-all font-mono text-base">{banner.temporaryPassword}</div>
                  <div className="mt-2 text-xs opacity-80">Store it securely. The user will be forced to change it on next login.</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-zinc-800 bg-zinc-950/80">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-zinc-50">
              <Plus className="h-5 w-5 text-lime-300" />
              Create technician
            </CardTitle>
            <CardDescription>New users are provisioned by admins only. A temporary password is issued once.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleCreateUser}>
              <UserFields form={createForm} onChange={updateCreateForm} />
              <div className="space-y-2">
                <Label htmlFor="create-password">Temporary password override</Label>
                <Input id="create-password" value={temporaryPasswordOverride} onChange={(event) => setTemporaryPasswordOverride(event.target.value)} placeholder="Leave blank to auto-generate" />
                <p className="text-xs text-zinc-500">{PASSWORD_REQUIREMENTS_TEXT}</p>
              </div>
              <Button type="submit" className="w-full" disabled={isCreating}>
                <Plus className="mr-2 h-4 w-4" />
                {isCreating ? "Creating user..." : "Create user"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-950/80">
            <CardHeader className="border-b border-zinc-800/80 pb-4">
              <CardTitle className="flex items-center gap-2 text-zinc-50">
                <UserRoundCog className="h-5 w-5 text-teal-300" />
                Existing users
              </CardTitle>
              <CardDescription>Choose a user to inspect or update. Admin self-edit is intentionally blocked here.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {isLoading ? (
                <div className="text-sm text-zinc-400">Loading users...</div>
              ) : (
                <div className="grid gap-3">
                  {users.map((user) => {
                    const selected = user.id === selectedUserId;
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className={`rounded-[22px] border px-4 py-4 text-left transition ${selected ? "border-lime-400/40 bg-lime-400/10" : "border-zinc-800 bg-zinc-950/50 hover:bg-zinc-900/70"}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <UserColorChip label={`${user.firstName} ${user.lastName}`.trim() || user.email} seed={`${user.firstName} ${user.lastName}`.trim() || user.email} />
                            <div className="text-sm text-zinc-400">{user.email} · {user.employeeId}</div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em]">
                            <span className={`rounded-full border px-2 py-1 ${user.role === "ADMIN" ? "border-teal-400/30 bg-teal-400/10 text-teal-300" : "border-zinc-700 bg-zinc-900 text-zinc-300"}`}>{user.role}</span>
                            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-300">{user.technicianLevel}</span>
                            <span className={`rounded-full border px-2 py-1 ${user.isActive ? "border-lime-400/30 bg-lime-400/10 text-lime-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}`}>{user.isActive ? "Active" : "Inactive"}</span>
                            {user.lockedUntil ? <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-amber-300">Locked</span> : null}
                            {user.id === currentUserId ? <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-amber-300">You</span> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-950/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-zinc-50">
                <ShieldCheck className="h-5 w-5 text-amber-300" />
                Manage selected user
              </CardTitle>
              <CardDescription>
                {selectedUser ? `Editing ${selectedUser.firstName} ${selectedUser.lastName}.` : "Select a user to edit."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedUser ? (
                <div className="space-y-5">
                  <form className="space-y-4" onSubmit={handleSaveUser}>
                    <UserFields form={editForm} onChange={updateEditForm} disableIdentityFields={selectedUser.id === currentUserId} />
                    <div className="grid gap-2 rounded-[20px] border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400 sm:grid-cols-3">
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Last login</div>
                        <div className="mt-1 text-zinc-200">{selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : "Never"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Failed attempts</div>
                        <div className="mt-1 text-zinc-200">{selectedUser.failedLoginAttempts}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Must change password</div>
                        <div className="mt-1 text-zinc-200">{selectedUser.mustChangePassword ? "Yes" : "No"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Updated</div>
                        <div className="mt-1 text-zinc-200">{new Date(selectedUser.updatedAt).toLocaleString()}</div>
                      </div>
                    </div>
                    {selectedUser.lockedUntil ? (
                      <div className="rounded-[20px] border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                        This account is locked until {new Date(selectedUser.lockedUntil).toLocaleString()}.
                        Saving an active profile or resetting the password clears the lock immediately.
                      </div>
                    ) : null}
                    <Button type="submit" disabled={isSaving || selectedUser.id === currentUserId}>
                      <Save className="mr-2 h-4 w-4" />
                      {isSaving ? "Saving..." : "Save changes"}
                    </Button>
                  </form>

                  <div className="rounded-3xl border border-zinc-800 bg-black/30 p-4">
                    <div className="flex items-center gap-2 text-zinc-50">
                      <KeyRound className="h-4 w-4 text-lime-300" />
                      <span className="font-semibold">Reset password</span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">Issues a new temporary password and revokes active sessions for the selected user.</p>
                    <div className="mt-4 space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="reset-password-override">Temporary password override</Label>
                        <Textarea id="reset-password-override" value={resetPasswordOverride} onChange={(event) => setResetPasswordOverride(event.target.value)} placeholder="Leave blank to auto-generate a secure temporary password" />
                        <p className="text-xs text-zinc-500">{PASSWORD_REQUIREMENTS_TEXT}</p>
                      </div>
                      <Button type="button" variant="secondary" onClick={handleResetPassword} disabled={isResetting || selectedUser.id === currentUserId}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        {isResetting ? "Resetting..." : "Reset password"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-zinc-400">Select a user from the list to manage their access.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </div>
  );
}

function UserFields({
  form,
  onChange,
  disableIdentityFields = false,
}: {
  form: UserFormState;
  onChange: (patch: Partial<UserFormState>) => void;
  disableIdentityFields?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`email-${disableIdentityFields ? "edit" : "create"}`}>Email</Label>
        <Input id={`email-${disableIdentityFields ? "edit" : "create"}`} value={form.email} onChange={(event) => onChange({ email: event.target.value })} required disabled={disableIdentityFields} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`first-name-${disableIdentityFields ? "edit" : "create"}`}>First name</Label>
        <Input id={`first-name-${disableIdentityFields ? "edit" : "create"}`} value={form.firstName} onChange={(event) => onChange({ firstName: event.target.value })} required disabled={disableIdentityFields} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`last-name-${disableIdentityFields ? "edit" : "create"}`}>Last name</Label>
        <Input id={`last-name-${disableIdentityFields ? "edit" : "create"}`} value={form.lastName} onChange={(event) => onChange({ lastName: event.target.value })} required disabled={disableIdentityFields} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`employee-id-${disableIdentityFields ? "edit" : "create"}`}>Employee ID</Label>
        <Input id={`employee-id-${disableIdentityFields ? "edit" : "create"}`} value={form.employeeId} onChange={(event) => onChange({ employeeId: event.target.value })} required disabled={disableIdentityFields} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`avatar-url-${disableIdentityFields ? "edit" : "create"}`}>Avatar URL</Label>
        <Input id={`avatar-url-${disableIdentityFields ? "edit" : "create"}`} value={form.avatarUrl} onChange={(event) => onChange({ avatarUrl: event.target.value })} placeholder="https://..." disabled={disableIdentityFields} />
      </div>
      <div className="space-y-2">
        <Label>Technician level</Label>
        <Select value={form.technicianLevel} onValueChange={(value) => onChange({ technicianLevel: value })} disabled={disableIdentityFields}>
          <SelectTrigger>
            <SelectValue placeholder="Select technician level" />
          </SelectTrigger>
          <SelectContent>
            {LEVEL_OPTIONS.map((level) => (
              <SelectItem key={level} value={level}>{level}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={form.role} onValueChange={(value) => onChange({ role: value })} disabled={disableIdentityFields}>
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((role) => (
              <SelectItem key={role} value={role}>{role}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Account status</Label>
        <Select value={form.isActive ? "active" : "inactive"} onValueChange={(value) => onChange({ isActive: value === "active" })} disabled={disableIdentityFields}>
          <SelectTrigger>
            <SelectValue placeholder="Select account status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
