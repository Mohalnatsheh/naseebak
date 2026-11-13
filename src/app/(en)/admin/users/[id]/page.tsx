"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, User, Shield, Loader2, Ban, CreditCard, Pencil,
  Calendar, MapPin, Heart, GraduationCap, Briefcase, Camera, Brain,
  Users as UsersIcon, Phone, Mail, Flag, Sparkles, HeartHandshake, MessagesSquare, History,
} from "lucide-react";
import Link from "next/link";
import { effectiveRequestStatus } from "@/lib/admin/cycle-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { enumLabel } from "@/lib/admin/enum-labels";
import { countryConfig, toCountry } from "@/lib/countries";
import { sectAsked } from "@/lib/profile-religion";
import { CountryFlag } from "@/components/shared/country-flag";
import { MemberProCard } from "@/components/admin/member-pro-card";
import { MemberDevicesCard } from "@/components/admin/member-devices-card";
import { MembersSuggestStatus } from "@/components/admin/members-suggest-status";
import { PersonLink, STATE_STYLE, fmtDate, fmtDateTime, plural } from "@/components/admin/admin-list-bits";
import { AdminEmptyState, AdminLoadError } from "@/components/admin/admin-states";
import { useConfirm } from "@/components/admin/confirm-dialog";
import { toLatinDigits } from "@/lib/digits";
import { FAILURE_LABELS } from "@/lib/payments/failure-labels";
import { CREDIT_REASON_LABELS, paymentPlanLabel } from "@/lib/admin/pro-labels";

interface UserDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  gender: string;
  /** A `CountryCode` ("JO" | "SA" | "LB"): follows the phone, members are only matched within it */
  country: string;
  role: string;
  status: string;
  isDeactivated: boolean;
  isFlagged: boolean;
  flagReason: string | null;
  matchCredits: number;
  createdAt: string;
  updatedAt: string;
  profile: Record<string, unknown> | null;
  personalityResult: { personalityType: string | null; createdAt: string } | null;
  parentInfo: {
    parentName: string; parentPhone: string; relationship: string; address: string | null; notes: string | null;
    shareConsentAt: string | null;
  } | null;
  identityDoc: {
    id: string; documentType: string; frontImageUrl: string; backImageUrl: string | null;
    status: string; rejectionReason: string | null; reviewNotes: string | null;
    reviewedAt: string | null; createdAt: string;
  } | null;
  /** Newest 20 */
  payments: PaymentRow[];
  photos: { id: string; url: string; isPrimary: boolean; order: number; createdAt: string }[];
  referralsReceived: { createdAt: string; creditsAwarded: boolean; referrer: { id: string; firstName: string; lastName: string } } | null;
  _count: {
    referralsGiven: number;
    receivedSuggestions: number; givenSuggestions: number;
    matchesAsFemale: number; matchesAsMale: number;
    payments: number; notifications: number;
  };
}

interface PaymentRow {
  id: string;
  planName: string | null;
  amount: string;
  currency: string;
  status: string;
  disputedAt: string | null;
  failureReason: string | null;
  /** "duplicate" | "ended": a paid Pro invoice that never made Pro live (refund decision needed) */
  proNotLive?: string | null;
  createdAt: string;
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

/** The shared admin status palette (design P3) */
const suggestionStatusColors: Record<string, string> = STATE_STYLE;

/** Account status: PENDING is a normal active account without an approved ID, so it is neutral, not amber. */
const userStatusColors: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  VERIFIED: "bg-green-100 text-green-800",
  REJECTED: "bg-destructive/10 text-destructive",
  SUSPENDED: "bg-destructive/10 text-destructive",
};

/** The shared admin status palette (design P3) */
const statusColors: Record<string, string> = STATE_STYLE;

/** Intro requests and chats (effective statuses from cycle-stats). */
/** The shared admin status palette (design P3) */
const cycleStatusColors: Record<string, string> = STATE_STYLE;

/** The shared admin status palette (design P3) */
const paymentStatusColors: Record<string, string> = STATE_STYLE;

const decisionLabel: Record<string, { text: string; className: string }> = {
  INTERESTED: { text: "Interested", className: "text-emerald-600" },
  DECLINED: { text: "Declined", className: "text-destructive" },
};

const creditReasonLabel = CREDIT_REASON_LABELS;

/** Amman dates, like every admin page */
const formatDate = (d: string | null) => fmtDate(d);

/** The sign-up placeholder email of phone accounts (`phone_…@naseeb.local`) is not a real address (ADM-22) */
function displayEmail(email: string): string {
  return /@naseeb\.local$/i.test(email) ? "None (signed up by phone)" : email;
}

/** "Card declined · insufficient funds", "Cancelled by the member", … */
function failureText(reason: string | null): string {
  if (!reason) return "Reason not recorded";
  const [kind, code] = reason.split(":");
  const label = FAILURE_LABELS[kind as keyof typeof FAILURE_LABELS] ?? kind;
  return code ? `${label} · ${code.replace(/_/g, " ")}` : label;
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
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [firstNameDraft, setFirstNameDraft] = useState("");
  const [lastNameDraft, setLastNameDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [genderEditorOpen, setGenderEditorOpen] = useState(false);
  const [genderReason, setGenderReason] = useState("");
  const [genderError, setGenderError] = useState("");
  const [savingGender, setSavingGender] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [actionError, setActionError] = useState("");
  const [endingChatId, setEndingChatId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{
    asRecipient: SuggestionRow[];
    asCandidate: SuggestionRow[];
  } | null>(null);
  const [sugFailed, setSugFailed] = useState(false);
  const [cycle, setCycle] = useState<CycleData | null>(null);
  const [cycleFailed, setCycleFailed] = useState(false);
  const [loadError, setLoadError] = useState("");
  const confirm = useConfirm();

  // Links like #chats or #chat-<id> (from the reports page) point into sections that load later
  useEffect(() => {
    if (!cycle || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [cycle]);

  const fetchCycle = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${id}/cycle`);
      if (res.ok) {
        setCycle(await res.json());
        setCycleFailed(false);
      } else setCycleFailed(true);
    } catch (err) {
      console.error(err);
      setCycleFailed(true);
    }
  }, [id]);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUser(data.user);
        setLoadError("");
      } else if (res.status !== 404) setLoadError(`Couldn't load this member (${res.status}).`);
    } catch (err) {
      console.error(err);
      setLoadError("Couldn't load this member. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/suggestions/user/${id}`);
      if (!res.ok) throw new Error(String(res.status));
      setSuggestions(await res.json());
      setSugFailed(false);
    } catch (err) {
      console.error(err);
      setSugFailed(true);
    }
  }, [id]);

  useEffect(() => {
    fetchUser();
    fetchCycle();
    fetchSuggestions();
  }, [fetchUser, fetchCycle, fetchSuggestions]);

  async function handleSuspend() {
    if (!user) return;
    const suspend = user.status !== "SUSPENDED";
    if (
      suspend &&
      !(await confirm({
        title: "Suspend this member?",
        description: <><bdi>{`${user.firstName} ${user.lastName}`}</bdi> can&apos;t use the site or the app until unsuspended.</>,
        warning: "Their active chats end now (both sides are told) and they are signed out of the app.",
        confirmLabel: "Suspend",
        destructive: true,
      }))
    )
      return;
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
    // Arabic-Indic digits and the Arabic minus count too (ADM-15)
    const trimmed = toLatinDigits(creditsDelta).replace(/[−–]/g, "-").replace(/\s+/g, "");
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

  function openGenderEditor() {
    setGenderReason("");
    setGenderError("");
    setGenderEditorOpen(!genderEditorOpen);
  }

  async function handleSaveGender() {
    if (!user) return;
    if (!genderReason.trim()) {
      setGenderError("Add a short reason for the change");
      return;
    }
    setSavingGender(true);
    setGenderError("");
    try {
      const res = await fetch(`/api/admin/users/${id}/gender`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender: user.gender === "MALE" ? "FEMALE" : "MALE", reason: genderReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setGenderEditorOpen(false);
        await Promise.all([fetchUser(), fetchCycle(), fetchSuggestions()]);
        toast.success(
          `Gender changed. ${plural(data.closed ?? 0, "open card")} closed` +
            (data.refunded ? `, ${plural(data.refunded, "credit")} refunded` : ""),
        );
      } else {
        setGenderError(data.error || "Could not change the gender");
      }
    } catch (err) {
      console.error(err);
      setGenderError("Network error — please try again");
    } finally {
      setSavingGender(false);
    }
  }

  function openNameEditor() {
    if (!user) return;
    setFirstNameDraft(user.firstName);
    setLastNameDraft(user.lastName);
    setNameError("");
    setNameEditorOpen(!nameEditorOpen);
  }

  async function handleSaveName() {
    setSavingName(true);
    setNameError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstNameDraft, lastName: lastNameDraft }),
      });
      if (res.ok) {
        setNameEditorOpen(false);
        await fetchUser();
        toast.success("Name updated");
      } else {
        const data = await res.json().catch(() => ({}));
        setNameError(data.error || "Could not save the name");
      }
    } catch (err) {
      console.error(err);
      setNameError("Network error — please try again");
    } finally {
      setSavingName(false);
    }
  }

  async function handleEndChat(chatId: string) {
    const ok = await confirm({
      title: "End this chat?",
      description: "It ends for both people, and both are told. This can't be undone.",
      confirmLabel: "End chat",
      destructive: true,
    });
    if (!ok) return;
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

  async function handleToggleFlag() {
    if (!user) return;
    let reason: string | null = null;
    if (!user.isFlagged) {
      // A textarea in the shared dialog, never window.prompt (ADM-12)
      reason = await confirm({
        title: "Flag this member?",
        description: "They get no new automatic suggestions until the flag is cleared. The reason is shown on this page only.",
        input: { label: "Why are you flagging this member?", multiline: true, required: true, maxLength: 500 },
        confirmLabel: "Flag member",
        destructive: true,
      });
      if (reason === null) return;
    }
    setFlagging(true);
    setActionError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isFlagged: !user.isFlagged,
          flagReason: reason,
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

  if (!user && loadError) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/users")}>
          <ArrowLeft className="h-4 w-4 me-2" /> Back to Users
        </Button>
        <AdminLoadError message={loadError} onRetry={fetchUser} />
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

      {/* Header: stays on screen while scrolling, with the actions and jumps to each section (design P2) */}
      <div className="sticky top-[60px] z-30 -mx-4 space-y-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-12 w-12 sm:h-16 sm:w-16 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {user.firstName.charAt(0)}{user.lastName.charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-display [overflow-wrap:anywhere]"><bdi>{`${user.firstName} ${user.lastName}`}</bdi></h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {/* Verified / Unverified belong to the legacy identity flow: only a suspension is news */}
              {user.status === "SUSPENDED" && <Badge className={userStatusColors[user.status] || ""}>{enumLabel("userStatus", user.status)}</Badge>}
              <Badge variant={user.gender === "MALE" ? "default" : "secondary"}>
                {user.gender === "MALE" ? "Male" : "Female"}
              </Badge>
              <Badge variant="outline">
                <CountryFlag country={toCountry(user.country)} className="me-1 inline h-3 w-4 align-[-1px]" />
                {countryConfig(user.country).nameEn}
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
              <p dir="auto" className="text-sm text-destructive mt-1 [overflow-wrap:anywhere] whitespace-pre-line">{user.flagReason}</p>
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
          <Button variant="outline" size="sm" onClick={openNameEditor}>
            <Pencil className="h-4 w-4 me-2" /> Edit name
          </Button>
          {user.role === "USER" && (
            <Button variant="outline" size="sm" onClick={openGenderEditor}>
              <UsersIcon className="h-4 w-4 me-2" /> Change gender
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={openCreditsEditor}
          >
            <CreditCard className="h-4 w-4 me-2" /> {plural(user.matchCredits, "credit")}
          </Button>
        </div>
      </div>
      <nav aria-label="Sections" className="flex flex-wrap gap-1.5 text-xs">
        {[
          ["suggestions", "Suggestions"],
          ["profile", "Profile"],
          ["photos", "Photos"],
          ["requests", "Requests"],
          ["chats", "Chats"],
          ["credits", "Credit history"],
          ["payments", "Payments"],
        ].map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className="rounded-full border bg-card px-2.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>
      </div>

      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span>{actionError}</span>
          <button onClick={() => setActionError("")} className="text-xs underline shrink-0">Dismiss</button>
        </div>
      )}

      {/* Name inline editor: the same rule as sign-up, Arabic letters */}
      {nameEditorOpen && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Input
                aria-label="First name"
                placeholder="First name"
                dir="rtl"
                maxLength={40}
                value={firstNameDraft}
                onChange={(e) => setFirstNameDraft(e.target.value)}
                className="flex-1 min-w-[160px]"
              />
              <Input
                aria-label="Last name"
                placeholder="Last name"
                dir="rtl"
                maxLength={40}
                value={lastNameDraft}
                onChange={(e) => setLastNameDraft(e.target.value)}
                className="flex-1 min-w-[160px]"
              />
              <Button size="sm" onClick={handleSaveName} disabled={savingName}>
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNameEditorOpen(false)}>Cancel</Button>
            </div>
            <p className="text-xs text-muted-foreground">Arabic letters, as at sign-up. The member sees the new name straight away, and so does anyone they are matched with.</p>
            {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Gender inline editor: for members who picked the wrong gender at sign-up (src/lib/admin/change-gender.ts) */}
      {genderEditorOpen && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            {totalMatches > 0 ? (
              <p className="text-sm text-destructive">
                This member has {plural(totalMatches, "match", "matches")}. A match stores who is the woman and who is the man, so the gender can&apos;t be changed.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium">
                    {user.gender === "MALE" ? "Male" : "Female"} → {user.gender === "MALE" ? "Female" : "Male"}
                  </span>
                  <Input
                    aria-label="Reason"
                    placeholder="Reason (required), e.g. picked the wrong gender at sign-up"
                    maxLength={200}
                    value={genderReason}
                    onChange={(e) => setGenderReason(e.target.value)}
                    className="flex-1 min-w-[220px]"
                  />
                  <Button size="sm" onClick={handleSaveGender} disabled={savingGender}>
                    {savingGender ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change gender"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setGenderEditorOpen(false)}>Cancel</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  All the member&apos;s open cards close, unanswered paid «مهتم» on them are refunded (the member&apos;s and the other people&apos;s), the hijab / beard answers and preferences are cleared so the member is asked again, and new cards from the right side are found straight away. The member gets no notice.
                </p>
              </>
            )}
            {genderError && <p className="text-sm text-destructive">{genderError}</p>}
          </CardContent>
        </Card>
      )}

      {/* Credits inline editor: add or remove, with a reason (kept in the credit history) */}
      {creditsDialogOpen && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="credits-delta" className="text-sm font-medium">Change credits by:</label>
              <Input
                id="credits-delta"
                inputMode="text"
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
              {(() => {
                const t = toLatinDigits(creditsDelta).replace(/[−–]/g, "-").replace(/\s+/g, "");
                return /^[+-]?\d+$/.test(t) && Number(t) !== 0 ? ` → ${user.matchCredits + Number(t)}` : "";
              })()}
            </p>
            {creditsError && <p className="text-sm text-destructive">{creditsError}</p>}
          </CardContent>
        </Card>
      )}


      {/* Last active, credits, open cards and why there are none */}
      <MembersSuggestStatus userId={id} credits={user.matchCredits} />

      {/* Where the member uses Naseebak and whether a push can reach them */}
      <div className="min-w-0"><MemberDevicesCard userId={id} /></div>
      <div className="min-w-0"><MemberProCard userId={id} /></div>

      <SuggestionsCard suggestions={suggestions} failed={sugFailed} onRetry={fetchSuggestions} />

      {/* Info Grid: min-w-0 lets a child with long text shrink inside its column on a phone */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [&>*]:min-w-0">
        {/* Basic Info */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Basic Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={displayEmail(user.email)} />
            <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={user.phone || "—"} />
            <InfoRow label="Country" value={countryConfig(user.country).nameEn} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Joined" value={formatDate(user.createdAt)} />
            <InfoRow icon={<CreditCard className="h-4 w-4" />} label="Credits" value={plural(user.matchCredits, "credit")} />
            {user.referralsReceived && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground min-w-[100px] shrink-0">Invited by:</span>
                <Link href={`/admin/users/${user.referralsReceived.referrer.id}`} className="font-medium hover:underline">
                  <bdi>{`${user.referralsReceived.referrer.firstName} ${user.referralsReceived.referrer.lastName}`}</bdi>
                </Link>
                <span className="text-xs text-muted-foreground">{user.referralsReceived.creditsAwarded ? "(reward paid)" : "(reward after setup)"}</span>
              </div>
            )}
            {user._count.referralsGiven > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-muted-foreground min-w-[100px] shrink-0">Invited:</span>
                <Link href={`/admin/referrals?referrer=${user.id}`} className="font-medium hover:underline">
                  {user._count.referralsGiven} {user._count.referralsGiven === 1 ? "member" : "members"}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profile Details */}
        <Card id="profile" className="scroll-mt-40">
          <CardHeader><CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5" /> Profile</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {p ? (
              <>
                <InfoRow icon={<Calendar className="h-4 w-4" />} label="DOB" value={p.dateOfBirth ? formatDate(p.dateOfBirth as string) : "—"} />
                <InfoRow icon={<MapPin className="h-4 w-4" />} label="City / Area" value={`${p.city || "—"} / ${p.area || "—"}`} />
                <InfoRow icon={<GraduationCap className="h-4 w-4" />} label="Education" value={String(p.education || "—")} />
                <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Job" value={String(p.job || "—")} />
                <InfoRow label="Nationality" value={String(p.nationality || "—")} />
                <InfoRow label="Marital Status" value={String(p.maritalStatus || "—")} />
                <InfoRow label="Height / Weight" value={`${p.height || "—"} cm / ${p.weight || "—"} kg`} />
                <InfoRow label="Religiosity" value={String(p.religiosity || "—")} />
                <InfoRow label="Religion" value={String(p.religion || "مسلم (not set)")} />
                <InfoRow label="Partner religion" value={String(p.prefReligion || "نفس ديانتي (not set)")} />
                {sectAsked(user.country, p.religion as string | null) && <InfoRow label="Sect" value={String(p.sect || "—")} />}
                <InfoRow label="Smoking" value={String(p.smokingStatus || "—")} />
                {user.gender === "FEMALE" && <InfoRow label="Hijab" value={p.niqab === true ? "Niqab" : p.hijab === true ? "Yes" : p.hijab === false ? "No" : "—"} />}
                {user.gender === "MALE" && <InfoRow label="Beard" value={p.beard === true ? "Yes" : p.beard === false ? "No" : "—"} />}
                <InfoRow label="Tribe" value={String(p.tribe || "—")} />
                <InfoRow label="About" value={String(p.aboutMe || "—")} />
                {!p.isComplete && <InfoRow label="Setup Step" value={String(p.setupStep)} />}
                <InfoRow label="Complete" value={p.isComplete ? "Yes" : "No"} />
              </>
            ) : (
              <p className="text-muted-foreground">No profile created yet</p>
            )}
          </CardContent>
        </Card>

        {/* Identity Doc: legacy, only for members who have one */}
        {user.identityDoc && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Identity Verification</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline">{user.identityDoc.documentType === "selfie" ? "Selfie" : user.identityDoc.documentType === "national_id" ? "National ID (legacy)" : "Passport (legacy)"}</Badge>
                <Badge className={statusColors[user.identityDoc.status] || ""}>{enumLabel("identityStatus", user.identityDoc.status)}</Badge>
              </div>
              {user.identityDoc.rejectionReason && (
                <p className="text-sm text-destructive bg-destructive/10 rounded p-2">Rejection: {user.identityDoc.rejectionReason}</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                {user.identityDoc.frontImageUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{user.identityDoc.documentType === "selfie" ? "Selfie" : "Front"}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin review of a stored upload URL, which may be a legacy base64 data: URL rather than a cdn.naseebak.com image */}
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
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin review of a stored upload URL, which may be a legacy base64 data: URL rather than a cdn.naseebak.com image */}
                    <img
                      src={user.identityDoc.backImageUrl}
                      alt="ID Back"
                      className="rounded border max-h-40 w-full object-contain bg-muted"
                    />
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Photos */}
        <Card id="photos" className="scroll-mt-40">
          <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Photos ({user.photos.length})</CardTitle></CardHeader>
          <CardContent>
            {user.photos.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {user.photos.map((photo) => (
                  <div key={photo.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- admin review of a stored upload URL, which may be a legacy base64 data: URL rather than a cdn.naseebak.com image */}
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
                <InfoRow label="Taken" value={formatDate(user.personalityResult.createdAt)} />
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
              <StatItem label="Matches" value={totalMatches} />
              <StatItem label="Payments" value={user._count.payments} />
              <StatItem label="Notifications" value={user._count.notifications} />
            </div>
          </CardContent>
        </Card>
      </div>

      {cycle ? (
        <CycleSections cycle={cycle} onEndChat={handleEndChat} endingChatId={endingChatId} />
      ) : cycleFailed ? (
        <div id="requests" className="scroll-mt-40">
          <AdminLoadError message="Couldn't load the requests, chats and credit history." onRetry={fetchCycle} />
        </div>
      ) : null}

      <PaymentsCard user={user} />
    </div>
  );
}

function ScoreCell({ score }: { score: number | null }) {
  return (
    <span className={score && score >= 70 ? "text-green-600 font-medium" : score && score >= 50 ? "text-amber-600" : "text-destructive"}>
      {score ? `${Math.round(score)}%` : "—"}
    </span>
  );
}

/** One side of a member's suggestions: `side` = which stored side this member is on */
function SuggestionTable({ rows, side, otherLabel }: { rows: SuggestionRow[]; side: "recipient" | "candidate"; otherLabel: string }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left p-2 font-medium">{otherLabel}</th>
            <th className="text-left p-2 font-medium">Score</th>
            <th className="text-left p-2 font-medium hidden md:table-cell">Flow</th>
            <th className="text-left p-2 font-medium">Status</th>
            <th className="text-left p-2 font-medium">This user</th>
            <th className="text-left p-2 font-medium">Other side</th>
            <th className="text-left p-2 font-medium hidden md:table-cell">Source</th>
            <th className="text-left p-2 font-medium hidden md:table-cell">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const other = side === "recipient" ? s.candidate : s.recipient;
            const mine = side === "recipient" ? s.recipientDecision : s.candidateDecision;
            const theirs = side === "recipient" ? s.candidateDecision : s.recipientDecision;
            return (
              <tr key={s.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => other && router.push(`/admin/users/${other.id}`)}>
                <td className="p-2">{other ? <PersonLink p={other} /> : "—"}</td>
                <td className="p-2"><ScoreCell score={s.compatibilityScore} /></td>
                <td className="p-2 hidden md:table-cell"><FlowBadge flow={s.flow} /></td>
                <td className="p-2"><SuggestionStatus s={s} /></td>
                <td className="p-2">{s.flow === "MUTUAL" ? <Decision value={mine} /> : "—"}</td>
                <td className="p-2">{s.flow === "MUTUAL" ? <Decision value={theirs} /> : "—"}</td>
                <td className="p-2 hidden md:table-cell"><Badge variant="outline" className="text-xs">{enumLabel("suggestionSource", s.source)}</Badge></td>
                <td className="p-2 text-muted-foreground hidden md:table-cell whitespace-nowrap">{formatDate(s.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SuggestionsCard({
  suggestions,
  failed,
  onRetry,
}: {
  suggestions: { asRecipient: SuggestionRow[]; asCandidate: SuggestionRow[] } | null;
  failed: boolean;
  onRetry: () => void;
}) {
  return (
    <Card id="suggestions" className="scroll-mt-40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Suggestions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed ? (
          <AdminLoadError message="Couldn't load the suggestions." onRetry={onRetry} />
        ) : !suggestions ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ) : (
          <>
            <div>
              <h4 className="text-sm font-semibold mb-2">Received ({suggestions.asRecipient.length})</h4>
              {suggestions.asRecipient.length === 0 ? (
                <p className="text-sm text-muted-foreground">No suggestions received</p>
              ) : (
                <SuggestionTable rows={suggestions.asRecipient} side="recipient" otherLabel="Candidate" />
              )}
            </div>
            <div>
              <h4 className="text-sm font-semibold mb-2">Sent To ({suggestions.asCandidate.length})</h4>
              {suggestions.asCandidate.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not suggested to anyone</p>
              ) : (
                <SuggestionTable rows={suggestions.asCandidate} side="candidate" otherLabel="Recipient" />
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentsCard({ user }: { user: UserDetail }) {
  const { payments } = user;
  // The list is found by phone; a member always has one, this is only for odd old rows
  const allHref = `/admin/payments${user.phone ? `?search=${user.phone}` : ""}`;
  return (
    <Card id="payments" className="scroll-mt-40">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Payments ({user._count.payments})</CardTitle>
          <Link href={allHref} className="text-sm text-primary hover:underline whitespace-nowrap">Open in Payments</Link>
        </div>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <AdminEmptyState icon={CreditCard} title="No payments" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Package</th>
                  <th className="text-left p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((pay) => (
                  <tr key={pay.id} className="border-b align-top">
                    <td className="p-2 text-muted-foreground whitespace-nowrap">{fmtDateTime(pay.createdAt)}</td>
                    <td className="p-2">
                      {paymentPlanLabel(pay.planName)}
                      {pay.proNotLive && pay.status === "COMPLETED" && (
                        <Badge
                          variant="outline"
                          className="ms-1 border-amber-300 bg-amber-50 text-amber-800"
                          title={pay.proNotLive === "duplicate" ? "A second subscription paid while one was live: never made Pro live" : "A renewal paid after Pro ended: Pro did not come back"}
                        >
                          Refund decision
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 font-medium whitespace-nowrap">{Number(pay.amount).toFixed(2)} {pay.currency}</td>
                    <td className="p-2">
                      <Badge className={`text-xs ${paymentStatusColors[pay.status] || ""}`}>{enumLabel("paymentStatus", pay.status)}</Badge>
                      {pay.disputedAt && <Badge variant="destructive" className="ms-1 text-xs">Disputed</Badge>}
                      {pay.status === "FAILED" && <p className="mt-1 text-xs text-muted-foreground">{failureText(pay.failureReason)}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {user._count.payments > payments.length && (
          <p className="mt-2 text-xs text-muted-foreground">Newest {payments.length} shown.</p>
        )}
      </CardContent>
    </Card>
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
  return <Badge className={`text-xs ${suggestionStatusColors[status] || ""}`}>{enumLabel("suggestionStatus", status)}</Badge>;
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
      <Card id="requests" className="scroll-mt-40">
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
                      <td className="p-2"><Badge variant="outline" className="text-xs">{enumLabel("introType", r.type)}</Badge></td>
                      <td className="p-2 text-muted-foreground">{r.direction === "sent" ? "Sent to" : "Received from"}</td>
                      <td className="p-2">
                        <Link href={`/admin/users/${r.other.id}`} className="text-primary hover:underline">
                          <bdi>{`${r.other.firstName} ${r.other.lastName}`}</bdi>
                        </Link>
                      </td>
                      <td className="p-2"><Badge className={`text-xs ${cycleStatusColors[r.status] || ""}`}>{enumLabel("requestStatus", r.status)}</Badge></td>
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

      <Card id="chats" className="scroll-mt-40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessagesSquare className="h-5 w-5" /> Chats ({cycle.chats.length})
          </CardTitle>
          <p className="text-xs text-muted-foreground">«View» opens a chat&apos;s full message history.</p>
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
                    {/* aria-label, not an sr-only span: that is absolutely positioned, escapes the scroller and made the whole page 506px wide on a phone */}
                    <th className="p-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {cycle.chats.map((c) => (
                    <tr key={c.id} id={`chat-${c.id}`} className="border-b target:bg-primary/5">
                      <td className="p-2">
                        <Link href={`/admin/users/${c.other.id}`} className="text-primary hover:underline">
                          <bdi>{`${c.other.firstName} ${c.other.lastName}`}</bdi>
                        </Link>
                      </td>
                      <td className="p-2"><Badge className={`text-xs ${cycleStatusColors[c.status] || ""}`}>{enumLabel("chatStatus", c.status)}</Badge></td>
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
                      <td className="space-x-2 whitespace-nowrap p-2 text-right">
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/admin/chats/${c.id}`}>View</Link>
                        </Button>
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

      <Card id="credits" className="scroll-mt-40">
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
                        {fmtDateTime(l.createdAt)}
                      </td>
                      <td className="p-2">
                        {/* REFUND covers two things: a payment refund takes credits away, an unanswered «مهتم» gives one back */}
                        {l.reason === "REFUND"
                          ? l.delta > 0 ? "Refund: «مهتم» with no answer" : "Payment refund"
                          : creditReasonLabel[l.reason] ?? l.reason}
                      </td>
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
