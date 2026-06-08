"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save, ShieldAlert } from "lucide-react";

import { formatPhoneNumber } from "@/lib/phone";

type Account = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "TENANT";
  isActive: boolean;
  phone?: string | null;
  title?: string | null;
};

export function AdminAccountEditor({ account }: { account: Account }) {
  const router = useRouter();
  const isAdmin = account.role === "ADMIN";
  const [form, setForm] = useState({
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    role: account.role === "TENANT" ? "TENANT" : "MANAGER",
    isActive: account.isActive,
    phone: formatPhoneNumber(account.phone ?? ""),
    title: account.title ?? ""
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Account update failed.");
      setMessage(payload.message || "Account updated.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Account update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="form-grid-2">
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">First name</span>
          <input className="field" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Last name</span>
          <input className="field" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Email</span>
          <input className="field" type="email" disabled={isAdmin} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Role</span>
          {isAdmin ? (
            <div className="field bg-[var(--surface)] text-sm font-semibold">SYSTEM ADMIN</div>
          ) : (
            <select className="field" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as "MANAGER" | "TENANT" })}>
              <option value="MANAGER">Manager</option>
              <option value="TENANT">Tenant</option>
            </select>
          )}
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Phone</span>
          <input className="field" value={form.phone} onChange={(event) => setForm({ ...form, phone: formatPhoneNumber(event.target.value) })} />
        </label>
        <label>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">Title</span>
          <input className="field" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </label>
      </div>
      <label className="flex items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface)] p-3">
        <span>
          <span className="block text-sm font-semibold">Active account</span>
          <span className="mt-1 block text-xs text-[var(--muted)]">Disabled accounts cannot sign in.</span>
        </span>
        <input type="checkbox" checked={form.isActive} disabled={isAdmin} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} className="h-5 w-5" />
      </label>
      {message ? <p className="border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 border border-[var(--brand)] bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save account"}
      </button>
      <div className="border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        <span className="inline-flex items-center gap-1 font-semibold"><ShieldAlert className="h-3.5 w-3.5" /> Safety boundary</span>
        <p className="mt-1">Impersonation and automatic password changes are intentionally unavailable. Users should use the audited password reset email flow.</p>
      </div>
    </div>
  );
}
