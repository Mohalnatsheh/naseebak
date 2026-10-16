"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, User, Shield, ShieldCheck, Loader2, Ban, CreditCard,
  Calendar, MapPin, Heart, GraduationCap, Briefcase, Camera, Brain,
  Users as UsersIcon, Phone, Mail, Flag, Sparkles, HeartHandshake, MessagesSquare, History,
} from "lucide-react";
import Link from "next/link";
import { effectiveRequestStatus } from "@/lib/admin/cycle-stats";
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
  parentInfo: {
    parentName: string; parentPhone: string; relationship: string; address: string | null; notes: string | null;
    shareConsentAt: string | null;
  } | null;
  identityDoc: {
    id: string; documentType: string; frontImageUrl: string; backImageUrl: string | null;
    status: string; rejectionReason: string | null; reviewNotes: string | null;
    reviewedAt: string | null; createdAt: string;
  } | null;
  photos: { id: string; url: string; isPrimary: boolean; order: number; createdAt: string }[];
  _count: {
    receivedSuggestions: number; givenSuggestions: number;
    matchesAsFemale: number; matchesAsMale: number;
    payments: number; notifications: number;
  };
}

interface SuggestionRow {
  id: string;
  compatibilityScore: number | null;
  status: string;
  source: string;
  createdAt: string;
  flow: "LEGACY" | "MUTUAL";
  expiresAt: string | null;
  recipientDecision: "INTERESTED" | "DECLINED" | null;
  candidateDecision: "INTERESTED" | "DECLINED" | null;
  candidate?: { id: string; firstName: string; lastName: string; gender: string };
  recipient?: { id: string; firstName: string; lastName: string; gender: string };
}

interface PersonRef { id: string; firstName: string; lastName: string }

interface CycleData {
  introRequests: {
    id: string; type: "FAMILY" | "CHAT"; direction: "sent" | "received"; other: PersonRef;
    status: string; createdAt: string; respondedAt: string | null; expiresAt: string;
  }[];
  chats: {
    id: string; other: PersonRef; status: string; createdAt: string; expiresAt: string; extended: boolean;
    endedBy: "user" | "other" | "admin" | null; endedByAdmin: boolean; endedAt: string | null;
    messages: { total: number; byUser: number; byOther: number };
  }[];
  ledger: {
    id: string; delta: number; reason: string; refId: string | null; admin: string | null;
    note: string | null; createdAt: string;
  }[];
}

const suggestionStatusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-muted text-muted-foreground",
};

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  VERIFIED: "bg-green-100 text-green-800",
  REJECTED: "bg-destructive/10 text-destructive",
  SUSPENDED: "bg-destructive/10 text-destructive",
};

/** Intro requests and chats (effective statuses from cycle-stats). */
const cycleStatusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-green-100 text-green-800",
  ACTIVE: "bg-green-100 text-green-800",
  DECLINED: "bg-destructive/10 text-destructive",
  ENDED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

const decisionLabel: Record<string, { text: string; className: string }> = {
  INTERESTED: { text: "Interested", className: "text-emerald-600" },
  DECLINED: { text: "Declined", className: "text-destructive" },
};

const creditReasonLabel: Record<string, string> = {
  REGISTRATION: "Registration",
  PURCHASE: "Purchase",
  REQUEST: "Family/chat request",
  SUGGESTION: "Suggestion (legacy)",
  ADMIN_ADJUST: "Admin adjustment",
  MIGRATION_GIFT: "New-cycle top-up",
  REFUND: "Refund",
  REFERRAL: "Referral reward",
};

function formatDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function Decision({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const d = decisionLabel[value];
  return <span className={`font-medium ${d?.className ?? ""}`}>{d?.text ?? value}</span>;
}

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [suspending, setSuspending] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [creditsDelta, setCreditsDelta] = useState("");
  const [creditsNote, setCreditsNote] = useState("");
  const [creditsError, setCreditsError] = useState("");
  const [savingCredits, setSavingCredits] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [actionError, setActionError] = useState("");
  const [endingChatId, setEndingChatId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{
    asRecipient: SuggestionRow[];
    asCandidate: SuggestionRow[];
  } | null>(null);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugExpanded, setSugExpanded] = useState(false);
  const [cycle, setCycle] = useState<CycleData | null>(null);

  useEffect(() => {
    fetchUser();
    fetchCycle();
  }, [id]);

  // Links like #chats or #chat-<id> (from the reports page) point into sections that load later
  useEffect(() => {
    if (!cycle || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [cycle]);

  async function fetchCycle() {
    try {
      const res = await fetch(`/api/admin/users/${id}/cycle`);
      if (res.ok) setCycle(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

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
    const suspend = user.status !== "SUSPENDED";
    if (suspend && !confirm("Suspend this user? Their active chats will be ended and they will be signed out of the app.")) return;
    setSuspending(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/users/${id}/suspend`, { method: "PUT" });
      if (res.ok) {
        await Promise.all([fetchUser(), fetchCycle()]);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || `Could not ${suspend ? "suspend" : "unsuspend"} this user`);
      }
    } catch (err) {
      console.error(err);
      setActionError("Network error — please try again");
    } finally {
      setSuspending(false);
    }
  }

  function openCreditsEditor() {
    setCreditsDelta("");
    setCreditsNote("");
    setCreditsError("");
    setCreditsDialogOpen(!creditsDialogOpen);
  }

  async function handleSaveCredits() {
    const trimmed = creditsDelta.trim();
    const delta = Number(trimmed);
    if (!/^[+-]?\d+$/.test(trimmed) || delta === 0) {
      setCreditsError("Enter a non-zero whole number, e.g. +3 or -1");
      return;
    }
    if (user && user.matchCredits + delta < 0) {
      setCreditsError(`The balance can't go below 0 (current: ${user.matchCredits})`);
      return;
    }
    if (!creditsNote.trim()) {
      setCreditsError("Add a short reason for the change");
      return;
    }
    setSavingCredits(true);
    setCreditsError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditsDelta: delta, note: creditsNote.trim() }),
      });
      if (res.ok) {
        setCreditsDialogOpen(false);
        await Promise.all([fetchUser(), fetchCycle()]);
      } else {
        const data = await res.json().catch(() => ({}));
        setCreditsError(data.error || "Could not save the credits change");
      }
    } catch (err) {
      console.error(err);
      setCreditsError("Network error — please try again");
    } finally {
      setSavingCredits(false);
    }
  }

  async function handleEndChat(chatId: string) {
    if (!confirm("End this chat for both people? They will be notified. This can't be undone.")) return;
    setEndingChatId(chatId);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/chats/${chatId}/end`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || "Could not end this chat");
      }
      await fetchCycle();
    } catch (err) {
      console.error(err);
      setActionError("Network error — please try again");
    } finally {
      setEndingChatId(null);
    }
  }

  async function fetchSuggestions() {
    if (suggestions) {
      setSugExpanded(!sugExpanded);
      return;
    }
    setSugLoading(true);
    setSugExpanded(true);
    try {
      const res = await fetch(`/api/admin/suggestions/user/${id}`);
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setSugLoading(false);
    }
  }

  async function handleToggleFlag() {
    if (!user) return;
    setFlagging(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isFlagged: !user.isFlagged,
          flagReason: !user.isFlagged ? "Manually flagged by admin" : null,
        }),
      });
      if (res.ok) {
        await fetchUser();
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || `Could not ${user.isFlagged ? "unflag" : "flag"} this user`);
      }
    } catch (err) {
      console.error(err);
      setActionError("Network error — please try again");
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{user.firstName} {user.lastName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge className={statusColors[user.status] || ""}>{user.status}</Badge>
              <Badge variant={user.gender === "MALE" ? "default" : "secondary"}>
                {user.gender === "MALE" ? "Male" : "Female"}
              </Badge>
              {user.role === "ADMIN" && <Badge variant="destructive">Admin</Badge>}
              {user.isDeactivated && <Badge variant="outline" className="text-destructive">Deactivated</Badge>}
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

        <div className="flex flex-wrap gap-2">
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
            onClick={openCreditsEditor}
          >
            <CreditCard className="h-4 w-4 me-2" /> Credits: {user.matchCredits}
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="text-xs underline shrink-0">Dismiss</button>
        </div>
      )}

      {/* Credits inline editor: add or remove, with a reason (kept in the credit history) */}
      {creditsDialogOpen && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="credits-delta" className="text-sm font-medium">Change credits by:</label>
              <Input
                id="credits-delta"
                inputMode="numeric"
                placeholder="+3 or -1"
                value={creditsDelta}
                onChange={(e) => setCreditsDelta(e.target.value)}
                className="w-28"
              />
              <Input
                aria-label="Reason"
                placeholder="Reason (required), e.g. compensation for a bug"
                maxLength={200}
                value={creditsNote}
                onChange={(e) => setCreditsNote(e.target.value)}
                className="flex-1 min-w-[220px]"
              />
              <Button size="sm" onClick={handleSaveCredits} disabled={savingCredits}>
                {savingCredits ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCreditsDialogOpen(false)}>Cancel</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Current balance: {user.matchCredits}
              {/^[+-]?\d+$/.test(creditsDelta.trim()) && Number(creditsDelta) !== 0 &&
                ` → ${user.matchCredits + Number(creditsDelta)}`}
            </p>
            {creditsError && <p className="text-sm text-destructive">{creditsError}</p>}
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
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Identity Verification</CardTitle></CardHeader>
          <CardContent>
            {user.identityDoc ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline">{user.identityDoc.documentType === "selfie" ? "Selfie" : user.identityDoc.documentType === "national_id" ? "National ID (legacy)" : "Passport (legacy)"}</Badge>
                  <Badge className={statusColors[user.identityDoc.status] || ""}>{user.identityDoc.status}</Badge>
                </div>
                {user.identityDoc.rejectionReason && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded p-2">Rejection: {user.identityDoc.rejectionReason}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {user.identityDoc.frontImageUrl && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{user.identityDoc.documentType === "selfie" ? "Selfie" : "Front"}</p>
                      <img
                        src={user.identityDoc.frontImageUrl}
                        alt={user.identityDoc.documentType === "selfie" ? "Selfie" : "ID Front"}
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
              <p className="text-sm text-muted-foreground">No verification selfie uploaded</p>
            )}
          </CardContent>
        </Card>

        {/* Photos */}
        <Card id="photos" className="scroll-mt-20">
          <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Photos ({user.photos.length})</CardTitle></CardHeader>
          <CardContent>
            {user.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                <InfoRow
                  label="Share consent"
                  value={user.parentInfo.shareConsentAt ? `Consented on ${formatDate(user.parentInfo.shareConsentAt)}` : "Not consented"}
                />
              </div>
            ) : (
              <p className="text-muted-foreground">No parent info</p>
            )}
          </CardContent>
        </Card>

        {/* Account Stats */}
        <Card>
          <CardHeader><CardTitle>Account Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <StatItem label="Suggestions received" value={user._count.receivedSuggestions} />
              <StatItem label="Suggested to others" value={user._count.givenSuggestions} />
              <StatItem label="Matches" value={totalMatches} />
              <StatItem label="Payments" value={user._count.payments} />
              <StatItem label="Notifications" value={user._count.notifications} />
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Legacy: "received" = suggested to this user, "suggested to others" = this user was shown to someone. Shared suggestions are seen by both people but counted once, under whichever side this user was stored on.
            </p>
          </CardContent>
        </Card>
      </div>

      {cycle && <CycleSections cycle={cycle} onEndChat={handleEndChat} endingChatId={endingChatId} />}

      {/* Suggestions Section (full width) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Suggestions</CardTitle>
            <Button variant="outline" size="sm" onClick={fetchSuggestions} disabled={sugLoading}>
              {sugLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : sugExpanded ? "Hide" : "Show"}
            </Button>
          </div>
        </CardHeader>
        {sugExpanded && suggestions && (
          <CardContent className="space-y-4">
            {/* As Recipient */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Received ({suggestions.asRecipient.length})</h4>
              {suggestions.asRecipient.length === 0 ? (
                <p className="text-sm text-muted-foreground">No suggestions received</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Candidate</th>
                        <th className="text-left p-2 font-medium">Score</th>
                        <th className="text-left p-2 font-medium">Flow</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium">This user</th>
                        <th className="text-left p-2 font-medium">Other side</th>
                        <th className="text-left p-2 font-medium">Source</th>
                        <th className="text-left p-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.asRecipient.map((s) => (
                        <tr key={s.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => s.candidate && router.push(`/admin/users/${s.candidate.id}`)}>
                          <td className="p-2">{s.candidate?.firstName} {s.candidate?.lastName}</td>
                          <td className="p-2">
                            <span className={s.compatibilityScore && s.compatibilityScore >= 70 ? "text-green-600 font-medium" : s.compatibilityScore && s.compatibilityScore >= 50 ? "text-amber-600" : "text-destructive"}>
                              {s.compatibilityScore ? `${Math.round(s.compatibilityScore)}%` : "—"}
                            </span>
                          </td>
                          <td className="p-2"><FlowBadge flow={s.flow} /></td>
                          <td className="p-2"><SuggestionStatus s={s} /></td>
                          <td className="p-2">{s.flow === "MUTUAL" ? <Decision value={s.recipientDecision} /> : "—"}</td>
                          <td className="p-2">{s.flow === "MUTUAL" ? <Decision value={s.candidateDecision} /> : "—"}</td>
                          <td className="p-2"><Badge variant="outline" className="text-xs">{s.source}</Badge></td>
                          <td className="p-2 text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* As Candidate */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Sent To ({suggestions.asCandidate.length})</h4>
              {suggestions.asCandidate.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not suggested to anyone</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">Recipient</th>
                        <th className="text-left p-2 font-medium">Score</th>
                        <th className="text-left p-2 font-medium">Flow</th>
                        <th className="text-left p-2 font-medium">Status</th>
                        <th className="text-left p-2 font-medium">This user</th>
                        <th className="text-left p-2 font-medium">Other side</th>
                        <th className="text-left p-2 font-medium">Source</th>
                        <th className="text-left p-2 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suggestions.asCandidate.map((s) => (
                        <tr key={s.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => s.recipient && router.push(`/admin/users/${s.recipient.id}`)}>
                          <td className="p-2">{s.recipient?.firstName} {s.recipient?.lastName}</td>
                          <td className="p-2">
                            <span className={s.compatibilityScore && s.compatibilityScore >= 70 ? "text-green-600 font-medium" : s.compatibilityScore && s.compatibilityScore >= 50 ? "text-amber-600" : "text-destructive"}>
                              {s.compatibilityScore ? `${Math.round(s.compatibilityScore)}%` : "—"}
                            </span>
                          </td>
                          <td className="p-2"><FlowBadge flow={s.flow} /></td>
                          <td className="p-2"><SuggestionStatus s={s} /></td>
                          <td className="p-2">{s.flow === "MUTUAL" ? <Decision value={s.candidateDecision} /> : "—"}</td>
                          <td className="p-2">{s.flow === "MUTUAL" ? <Decision value={s.recipientDecision} /> : "—"}</td>
                          <td className="p-2"><Badge variant="outline" className="text-xs">{s.source}</Badge></td>
                          <td className="p-2 text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      {icon && <span className="mt-0.5 text-muted-foreground">{icon}</span>}
      <span className="text-muted-foreground min-w-[100px] shrink-0">{label}:</span>
      <span className="font-medium min-w-0 break-words [overflow-wrap:anywhere]">{value}</span>
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

function FlowBadge({ flow }: { flow: "LEGACY" | "MUTUAL" }) {
  return flow === "MUTUAL" ? (
    <Badge className="text-xs bg-primary/10 text-primary">Shared</Badge>
  ) : (
    <Badge variant="outline" className="text-xs">Legacy</Badge>
  );
}

function SuggestionStatus({ s }: { s: SuggestionRow }) {
  const status = effectiveRequestStatus(s);
  return <Badge className={`text-xs ${suggestionStatusColors[status] || ""}`}>{status}</Badge>;
}

function chatEndedLabel(c: CycleData["chats"][number]) {
  if (c.endedByAdmin || c.endedBy === "admin") return `${formatDate(c.endedAt)} · Ended by admin`;
  if (!c.endedAt) return "—";
  return `${formatDate(c.endedAt)} · by ${c.endedBy === "user" ? "this user" : "the other"}`;
}

function CycleSections({
  cycle,
  onEndChat,
  endingChatId,
}: {
  cycle: CycleData;
  onEndChat: (chatId: string) => void;
  endingChatId: string | null;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HeartHandshake className="h-5 w-5" /> Introduction requests ({cycle.introRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cycle.introRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No family or chat requests</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Type</th>
                    <th className="text-left p-2 font-medium">Direction</th>
                    <th className="text-left p-2 font-medium">Other person</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Sent</th>
                    <th className="text-left p-2 font-medium hidden md:table-cell">Responded</th>
                    <th className="text-left p-2 font-medium hidden md:table-cell">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {cycle.introRequests.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2"><Badge variant="outline" className="text-xs">{r.type === "FAMILY" ? "Family" : "Chat"}</Badge></td>
                      <td className="p-2 text-muted-foreground">{r.direction === "sent" ? "Sent to" : "Received from"}</td>
                      <td className="p-2">
                        <Link href={`/admin/users/${r.other.id}`} className="text-primary hover:underline">
                          {r.other.firstName} {r.other.lastName}
                        </Link>
                      </td>
                      <td className="p-2"><Badge className={`text-xs ${cycleStatusColors[r.status] || ""}`}>{r.status}</Badge></td>
                      <td className="p-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
                      <td className="p-2 text-muted-foreground hidden md:table-cell">{formatDate(r.respondedAt)}</td>
                      <td className="p-2 text-muted-foreground hidden md:table-cell">{formatDate(r.expiresAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="chats" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5" /> Chats ({cycle.chats.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">Dates, status and message counts only — message content is never shown to admins.</p>
        </CardHeader>
        <CardContent>
          {cycle.chats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No chats</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">With</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">Started</th>
                    <th className="text-left p-2 font-medium">Expires</th>
                    <th className="text-left p-2 font-medium">Ended</th>
                    <th className="text-right p-2 font-medium">Messages</th>
                    <th className="p-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {cycle.chats.map((c) => (
                    <tr key={c.id} id={`chat-${c.id}`} className="border-b target:bg-primary/5">
                      <td className="p-2">
                        <Link href={`/admin/users/${c.other.id}`} className="text-primary hover:underline">
                          {c.other.firstName} {c.other.lastName}
                        </Link>
                      </td>
                      <td className="p-2"><Badge className={`text-xs ${cycleStatusColors[c.status] || ""}`}>{c.status}</Badge></td>
                      <td className="p-2 text-muted-foreground">{formatDate(c.createdAt)}</td>
                      <td className="p-2 text-muted-foreground">
                        {formatDate(c.expiresAt)}
                        {c.extended && <span className="ms-1 text-xs">(extended)</span>}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {chatEndedLabel(c)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        <span className="font-medium">{c.messages.total}</span>
                        <span className="text-muted-foreground text-xs ms-1">({c.messages.byUser} / {c.messages.byOther})</span>
                      </td>
                      <td className="p-2 text-right">
                        {c.status === "ACTIVE" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => onEndChat(c.id)}
                            disabled={endingChatId === c.id}
                          >
                            {endingChatId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "End chat"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">Messages: total (this user / the other).</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="credits" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Credit history
          </CardTitle>
          <p className="text-xs text-muted-foreground">Recorded from the credit-history release on; earlier changes are not listed. Last 100.</p>
        </CardHeader>
        <CardContent>
          {cycle.ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recorded credit changes</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium">Date</th>
                    <th className="text-left p-2 font-medium">Reason</th>
                    <th className="text-right p-2 font-medium">Change</th>
                    <th className="text-left p-2 font-medium hidden md:table-cell">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {cycle.ledger.map((l) => (
                    <tr key={l.id} className="border-b">
                      <td className="p-2 text-muted-foreground">
                        {formatDate(l.createdAt)} {new Date(l.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="p-2">{creditReasonLabel[l.reason] ?? l.reason}</td>
                      <td className={`p-2 text-right tabular-nums font-semibold ${l.delta > 0 ? "text-emerald-600" : "text-destructive"}`}>
                        {l.delta > 0 ? `+${l.delta}` : l.delta}
                      </td>
                      <td className="p-2 text-muted-foreground text-xs hidden md:table-cell">
                        {[l.note, l.admin && `by ${l.admin}`, l.refId && `ref ${l.refId}`].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
