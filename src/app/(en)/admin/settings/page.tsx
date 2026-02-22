"use client";

import { useState, useEffect } from "react";
import { Settings, Loader2, Plus, UserPlus, BarChart3, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface AdminAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

export default function AdminSettingsPage() {
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Registration toggle state
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [regLoading, setRegLoading] = useState(true);
  const [regToggling, setRegToggling] = useState(false);

  // Tracking settings state
  const [gtmId, setGtmId] = useState("");
  const [fbPixelId, setFbPixelId] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(true);
  const [gtmSaving, setGtmSaving] = useState(false);
  const [fbSaving, setFbSaving] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [trackingSuccess, setTrackingSuccess] = useState("");

  useEffect(() => {
    fetchAdmins();
    fetchRegistrationStatus();
    fetchTrackingSettings();
  }, []);

  async function fetchRegistrationStatus() {
    try {
      const res = await fetch("/api/admin/settings/registration");
      const data = await res.json();
      setRegistrationOpen(data.registrationOpen ?? true);
    } catch (err) {
      console.error(err);
    } finally {
      setRegLoading(false);
    }
  }

  async function toggleRegistration() {
    setRegToggling(true);
    try {
      const res = await fetch("/api/admin/settings/registration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationOpen: !registrationOpen }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegistrationOpen(data.registrationOpen);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRegToggling(false);
    }
  }

  async function fetchTrackingSettings() {
    try {
      const res = await fetch("/api/admin/settings/tracking");
      const data = await res.json();
      setGtmId(data.gtmId || "");
      setFbPixelId(data.fbPixelId || "");
    } catch (err) {
      console.error(err);
    } finally {
      setTrackingLoading(false);
    }
  }

  async function saveTracking(field: "gtmId" | "fbPixelId") {
    setTrackingError("");
    setTrackingSuccess("");
    const isSavingGtm = field === "gtmId";
    if (isSavingGtm) setGtmSaving(true);
    else setFbSaving(true);

    try {
      const body = isSavingGtm ? { gtmId } : { fbPixelId };
      const res = await fetch("/api/admin/settings/tracking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        setTrackingSuccess(
          isSavingGtm ? "GTM ID saved successfully" : "Facebook Pixel ID saved successfully"
        );
        setTimeout(() => setTrackingSuccess(""), 3000);
      } else {
        setTrackingError(data.error || "Failed to save tracking settings");
      }
    } catch {
      setTrackingError("An unexpected error occurred");
    } finally {
      if (isSavingGtm) setGtmSaving(false);
      else setFbSaving(false);
    }
  }

  async function fetchAdmins() {
    try {
      const res = await fetch("/api/admin/settings/admins");
      const data = await res.json();
      setAdmins(data.admins || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/admin/settings/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess("Admin account created successfully!");
        setFirstName("");
        setLastName("");
        setEmail("");
        setPassword("");
        setShowForm(false);
        await fetchAdmins();
      } else {
        setError(data.error || "Failed to create admin");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Settings className="h-7 w-7 text-primary" />
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">Manage admin accounts and platform settings</p>
      </div>

      {/* Platform Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Platform Settings</CardTitle>
          <CardDescription>Control platform-wide features</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">User Registration</span>
                {regLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <Badge variant={registrationOpen ? "default" : "destructive"}>
                    {registrationOpen ? "Open" : "Closed"}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {registrationOpen
                  ? "New users can create accounts on the platform."
                  : "Registration is closed. Only existing users can log in."}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleRegistration}
              disabled={regLoading || regToggling}
              className="relative shrink-0 ms-4"
              aria-label="Toggle registration"
            >
              <div
                className={`h-6 w-11 rounded-full transition-colors duration-300 ${
                  regLoading || regToggling
                    ? "bg-muted"
                    : registrationOpen
                    ? "bg-primary"
                    : "bg-muted"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
                    registrationOpen ? "left-[calc(100%-1.375rem)]" : "left-0.5"
                  }`}
                />
              </div>
              {regToggling && (
                <Loader2 className="absolute -top-1 -right-1 h-3 w-3 animate-spin text-primary" />
              )}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Tracking & Analytics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Tracking & Analytics
          </CardTitle>
          <CardDescription>
            Configure Google Tag Manager and Facebook Pixel for user-facing pages
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {trackingLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {trackingError && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {trackingError}
                </div>
              )}
              {trackingSuccess && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  {trackingSuccess}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="gtm-id">Google Tag Manager Container ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="gtm-id"
                    value={gtmId}
                    onChange={(e) => setGtmId(e.target.value)}
                    placeholder="GTM-XXXXXXX"
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveTracking("gtmId")}
                    disabled={gtmSaving}
                  >
                    {gtmSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Format: GTM-XXXXXXX. Leave empty to disable.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fb-pixel-id">Facebook Pixel ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="fb-pixel-id"
                    value={fbPixelId}
                    onChange={(e) => setFbPixelId(e.target.value)}
                    placeholder="123456789012345"
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => saveTracking("fbPixelId")}
                    disabled={fbSaving}
                  >
                    {fbSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Numeric ID from Facebook Events Manager. Leave empty to disable.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Admin Accounts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Admin Accounts</CardTitle>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 me-2" />
            Add Admin
          </Button>
        </CardHeader>
        <CardContent>
          {success && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 mb-4">
              {success}
            </div>
          )}

          {/* Create form */}
          {showForm && (
            <div className="border rounded-lg p-4 mb-4 space-y-4">
              <h4 className="font-medium flex items-center gap-2">
                <UserPlus className="h-4 w-4" /> New Admin Account
              </h4>

              {error && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>First Name</Label>
                    <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  </div>
                  <div className="space-y-1">
                    <Label>Last Name</Label>
                    <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
                  <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={creating}>
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Admin"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 text-sm font-medium">Name</th>
                    <th className="text-left p-3 text-sm font-medium">Email</th>
                    <th className="text-left p-3 text-sm font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {admin.firstName.charAt(0)}
                          </div>
                          <span className="font-medium text-sm">{admin.firstName} {admin.lastName}</span>
                          <Badge variant="destructive" className="text-xs">Admin</Badge>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-muted-foreground">{admin.email}</td>
                      <td className="p-3 text-sm text-muted-foreground">
                        {new Date(admin.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
