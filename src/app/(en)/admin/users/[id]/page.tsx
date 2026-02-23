"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, User, Shield, ShieldCheck, Loader2, Ban, CreditCard,
  Calendar, MapPin, Heart, GraduationCap, Briefcase, Camera, Brain,
  Users as UsersIcon, Phone, Mail, Flag,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface UserDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  gender: string;
  role: string;
  status: string;
  isVerified: boolean;
  isDeactivated: boolean;
  isFlagged: boolean;
  flagReason: string | null;
  matchCredits: number;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile: Record<string, unknown> | null;
  personalityResult: { personalityType: string | null; vector: number[]; createdAt: string } | null;
  parentInfo: { parentName: string; parentPhone: string; relationship: string; address: string | null; notes: string | null } | null;
  identityDoc: {
    id: string; documentType: string; frontImageUrl: string; backImageUrl: string | null;
    status: string; rejectionReason: string | null; reviewNotes: string | null;
    reviewedAt: string | null; createdAt: string;
  } | null;
  photos: { id: string; url: string; isPrimary: boolean; order: number; createdAt: string }[];
  subscriptions: { id: string; plan: string; suggestionsLeft: number; status: string; startsAt: string; expiresAt: string }[];
  _count: {
    receivedSuggestions: number; givenSuggestions: number;
    matchesAsFemale: number; matchesAsMale: number;
    payments: number; notifications: number;
  };
}

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-red-100 text-red-800",
};

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [newCredits, setNewCredits] = useState("");
  const [savingCredits, setSavingCredits] = useState(false);
  const [flagging, setFlagging] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [id]);

  async function fetchUser() {
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      const data = await res.json();
      setUser(data.user);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSuspend() {
    if (!user) return;
    setSuspending(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/suspend`, { method: "PUT" });
      if (res.ok) {
        await fetchUser();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSuspending(false);
    }
  }

  async function handleSaveCredits() {
    const credits = parseInt(newCredits);
    if (isNaN(credits) || credits < 0) return;
    setSavingCredits(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchCredits: credits }),
      });
      if (res.ok) {
        setCreditsDialogOpen(false);
        await fetchUser();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingCredits(false);
    }
  }

  async function handleToggleFlag() {
    if (!user) return;
    setFlagging(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isFlagged: !user.isFlagged,
          flagReason: !user.isFlagged ? "Manually flagged by admin" : null,
        }),
      });
      if (res.ok) await fetchUser();
    } catch (err) {
      console.error(err);
    } finally {
      setFlagging(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">User not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/users")}>
          <ArrowLeft className="h-4 w-4 me-2" /> Back to Users
        </Button>
      </div>
    );
  }

  const p = user.profile as Record<string, unknown> | null;
  const totalMatches = user._count.matchesAsFemale + user._count.matchesAsMale;

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => router.push("/admin/users")}>
        <ArrowLeft className="h-4 w-4 me-2" /> Back to Users
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user.firstName} {user.lastName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={statusColors[user.status] || ""}>{user.status}</Badge>
              <Badge variant={user.gender === "MALE" ? "default" : "secondary"}>
                {user.gender === "MALE" ? "Male" : "Female"}
              </Badge>
              {user.role === "ADMIN" && <Badge variant="destructive">Admin</Badge>}
              {user.isDeactivated && <Badge variant="outline" className="text-red-600">Deactivated</Badge>}
              {user.isFlagged && (
                <Badge variant="outline" className="text-destructive border-destructive/30">
                  <Flag className="h-3 w-3 me-1" />Flagged
                </Badge>
              )}
            </div>
            {user.isFlagged && user.flagReason && (
              <p className="text-sm text-destructive mt-1">{user.flagReason}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {user.role !== "ADMIN" && (
            <Button
              variant={user.status === "SUSPENDED" ? "default" : "destructive"}
              size="sm"
              onClick={handleSuspend}
              disabled={suspending}
            >
              {suspending ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <><Ban className="h-4 w-4 me-2" />{user.status === "SUSPENDED" ? "Unsuspend" : "Suspend"}</>
              )}
            </Button>
          )}
          {user.role !== "ADMIN" && (
            <Button
              variant={user.isFlagged ? "outline" : "destructive"}
              size="sm"
              onClick={handleToggleFlag}
              disabled={flagging}
            >
              {flagging ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <><Flag className="h-4 w-4 me-2" />{user.isFlagged ? "Unflag" : "Flag"}</>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setNewCredits(String(user.matchCredits)); setCreditsDialogOpen(!creditsDialogOpen); }}
          >
            <CreditCard className="h-4 w-4 me-2" /> Credits: {user.matchCredits}
          </Button>
        </div>
      </div>

      {/* Credits inline editor */}
      {creditsDialogOpen && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Adjust Credits:</label>
              <Input
                type="number"
                min="0"
                value={newCredits}
                onChange={(e) => setNewCredits(e.target.value)}
                className="w-32"
              />
              <Button size="sm" onClick={handleSaveCredits} disabled={savingCredits}>
                {savingCredits ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreditsDialogOpen(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Basic Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={user.email} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={user.phone || "—"} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Joined" value={new Date(user.createdAt).toLocaleDateString()} />
            <InfoRow icon={<ShieldCheck className="h-4 w-4" />} label="Verified" value={user.isVerified ? `Yes (${user.verifiedAt ? new Date(user.verifiedAt).toLocaleDateString() : ""})` : "No"} />
            <InfoRow icon={<CreditCard className="h-4 w-4" />} label="Credits" value={String(user.matchCredits)} />
          </CardContent>
        </Card>

        {/* Profile Details */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5" /> Profile</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {p ? (
              <>
                <InfoRow icon={<Calendar className="h-4 w-4" />} label="DOB" value={p.dateOfBirth ? new Date(p.dateOfBirth as string).toLocaleDateString() : "—"} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="City / Area" value={`${p.city || "—"} / ${p.area || "—"}`} />
                <InfoRow icon={<GraduationCap className="h-4 w-4" />} label="Education" value={String(p.education || "—")} />
                <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Job" value={String(p.job || "—")} />
                <InfoRow label="Nationality" value={String(p.nationality || "—")} />
                <InfoRow label="Marital Status" value={String(p.maritalStatus || "—")} />
                <InfoRow label="Height / Weight" value={`${p.height || "—"} cm / ${p.weight || "—"} kg`} />
                <InfoRow label="Religiosity" value={String(p.religiosity || "—")} />
                <InfoRow label="Smoking" value={String(p.smokingStatus || "—")} />
                {user.gender === "FEMALE" && <InfoRow label="Hijab" value={p.hijab === true ? "Yes" : p.hijab === false ? "No" : "—"} />}
                {user.gender === "MALE" && <InfoRow label="Beard" value={p.beard === true ? "Yes" : p.beard === false ? "No" : "—"} />}
                <InfoRow label="Tribe" value={String(p.tribe || "—")} />
                <InfoRow label="About" value={String(p.aboutMe || "—")} />
                <InfoRow label="Setup Step" value={String(p.setupStep)} />
                <InfoRow label="Complete" value={p.isComplete ? "Yes" : "No"} />
              </>
            ) : (
              <p className="text-muted-foreground">No profile created yet</p>
            )}
          </CardContent>
        </Card>

        {/* Identity Doc */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Identity Document</CardTitle></CardHeader>
          <CardContent>
            {user.identityDoc ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{user.identityDoc.documentType === "national_id" ? "National ID" : "Passport"}</Badge>
                  <Badge className={statusColors[user.identityDoc.status] || ""}>{user.identityDoc.status}</Badge>
                </div>
                {user.identityDoc.rejectionReason && (
                  <p className="text-sm text-red-600 bg-red-50 rounded p-2">Rejection: {user.identityDoc.rejectionReason}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {user.identityDoc.frontImageUrl && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Front</p>
                      <img
                        src={user.identityDoc.frontImageUrl}
                        alt="ID Front"
                        className="rounded border max-h-40 w-full object-contain bg-muted"
                      />
                    </div>
                  )}
                  {user.identityDoc.backImageUrl && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Back</p>
                      <img
                        src={user.identityDoc.backImageUrl}
                        alt="ID Back"
                        className="rounded border max-h-40 w-full object-contain bg-muted"
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No identity document uploaded</p>
            )}
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Photos ({user.photos.length})</CardTitle></CardHeader>
          <CardContent>
            {user.photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {user.photos.map((photo) => (
                  <div key={photo.id} className="relative">
                    <img
                      src={photo.url}
                      alt="User photo"
                      className="rounded border h-24 w-full object-cover"
                    />
                    {photo.isPrimary && (
                      <Badge className="absolute top-1 left-1 text-xs" variant="default">Primary</Badge>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No photos uploaded</p>
            )}
          </CardContent>
        </Card>

        {/* Personality Quiz */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5" /> Personality Quiz</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {user.personalityResult ? (
              <div className="space-y-2">
                <InfoRow label="Type" value={user.personalityResult.personalityType || "—"} />
                <InfoRow label="Taken" value={new Date(user.personalityResult.createdAt).toLocaleDateString()} />
                <InfoRow label="Vector" value={user.personalityResult.vector.map(v => v.toFixed(2)).join(", ")} />
              </div>
            ) : (
              <p className="text-muted-foreground">Quiz not taken</p>
            )}
          </CardContent>
        </Card>

        {/* Parent Info */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><UsersIcon className="h-5 w-5" /> Parent/Guardian Info</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {user.parentInfo ? (
              <div className="space-y-2">
                <InfoRow label="Name" value={user.parentInfo.parentName} />
                <InfoRow label="Phone" value={user.parentInfo.parentPhone} />
                <InfoRow label="Relationship" value={user.parentInfo.relationship} />
                <InfoRow label="Address" value={user.parentInfo.address || "—"} />
                {user.parentInfo.notes && <InfoRow label="Notes" value={user.parentInfo.notes} />}
              </div>
            ) : (
              <p className="text-muted-foreground">No parent info</p>
            )}
          </CardContent>
        </Card>

        {/* Subscriptions */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Subscriptions</CardTitle></CardHeader>
          <CardContent>
            {user.subscriptions.length > 0 ? (
              <div className="space-y-2">
                {user.subscriptions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between text-sm border rounded p-2">
                    <div>
                      <span className="font-medium">{sub.plan}</span>
                      <span className="text-muted-foreground ml-2">({sub.suggestionsLeft} left)</span>
                    </div>
                    <Badge className={sub.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {sub.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No subscriptions</p>
            )}
          </CardContent>
        </Card>

        {/* Account Stats */}
        <Card>
          <CardHeader><CardTitle>Account Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <StatItem label="Received Suggestions" value={user._count.receivedSuggestions} />
              <StatItem label="Given Suggestions" value={user._count.givenSuggestions} />
              <StatItem label="Matches" value={totalMatches} />
              <StatItem label="Payments" value={user._count.payments} />
              <StatItem label="Notifications" value={user._count.notifications} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground min-w-[100px]">{label}:</span>
      <span className="font-medium break-all">{value}</span>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="border rounded p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
