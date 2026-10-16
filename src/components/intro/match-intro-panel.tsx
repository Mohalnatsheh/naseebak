"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Users,
  MessageCircle,
  Clock,
  CheckCircle2,
  Inbox,
  Ban,
  CalendarHeart,
  ArrowLeft,
  Coins,
  Gift,
  Loader2,
  X,
  HeartOff,
  UserX,
  PartyPopper,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import type { IntroState } from "@/lib/intro/requests";
import { IntroConfirmDialog, type IntroDialogMode } from "./intro-confirm-dialog";
import { GuardianContactCard } from "./guardian-contact-card";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import { daysLabel, daysLeft, postJson } from "./intro-utils";

type Tone = "amber" | "accent" | "emerald" | "muted" | "primary";

const TONE: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-700 border-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300",
  accent: "bg-accent/15 text-accent-foreground border-accent/30",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300",
  muted: "bg-muted text-muted-foreground border-border/60",
  primary: "bg-primary/10 text-primary border-primary/20",
};

function Chip({ tone, icon: Icon, children }: { tone: Tone; icon: typeof Clock; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", TONE[tone])}>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

interface DialogState {
  mode: IntroDialogMode;
  type: "FAMILY" | "CHAT";
  requestId?: string;
}

/** Calm note shown instead of the request tiles when a match is closed. */
export function MatchClosedNote({
  reason,
  children,
}: {
  reason: "blocked" | "inactive" | "finished";
  children?: React.ReactNode;
}) {
  const Icon = reason === "inactive" ? UserX : reason === "blocked" ? Ban : HeartOff;
  const title = reason === "inactive" ? "هذا الحساب غير نشط حالياً" : "انتهى هذا التوافق";
  const text =
    reason === "inactive"
      ? "لا يمكن إرسال طلبات أو الرد عليها لهذا التوافق الآن."
      : reason === "blocked"
        ? "قمت بحظر هذا الشخص، لذلك لا تظهر صوره ولا تتوفر أي خطوات تعارف."
        : "لم تعد هناك خطوات تعارف متاحة لهذا التوافق. نتمنى لك التوفيق في اقتراحاتك القادمة.";
  return (
    <section className="mt-4 rounded-2xl border border-border/60 bg-muted/30 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{text}</p>
          {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
        </div>
      </div>
    </section>
  );
}

/**
 * "خطوات التعارف" on a mutual match: family introduction and chat requests.
 * Renders nothing while the new cycle switch is off.
 */
/** Credit on interest: requests (and chat → family) are free after the match. */
const FREE_REQUEST_NOTE = "مجاناً — الطلبات والمحادثة مجانية بعد التوافق.";

export function MatchIntroPanel({ matchId, partnerName }: { matchId: string; partnerName: string }) {
  const router = useRouter();
  const { refreshUnread, refreshProfile, profile } = useDashboardData();
  // Partner gender = opposite of the viewer's
  const partnerFemale = profile ? profile.gender !== "FEMALE" : false;
  const viewerFemale = profile?.gender === "FEMALE";
  const g = (masculine: string, feminine: string) => (viewerFemale ? feminine : masculine);
  const [state, setState] = useState<IntroState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [shareConsent, setShareConsent] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/intro`);
      if (res.ok) setState(await res.json());
    } catch {
      // Panel stays hidden on network errors
    }
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!state) {
    // Keep the space while loading so the card doesn't jump
    return <div className="mt-4 h-40 animate-pulse rounded-2xl border border-primary/10 bg-primary/[0.03]" aria-hidden />;
  }
  const { family, chat } = state;
  if (state.closed) {
    return (
      <MatchClosedNote reason={state.closed}>
        {state.closed === "finished" && chat.conversationId && (
          <Button asChild size="sm" variant="outline">
            <Link href={`/dashboard/chats/${chat.conversationId}`}>عرض المحادثة</Link>
          </Button>
        )}
      </MatchClosedNote>
    );
  }
  // Switch off: no new requests, but answers to waiting requests and accepted results stay
  const canSend = state.flags.introRequests;
  // Credit on interest: requests are free (also on matches from before the switch)
  const freeRequests = !!state.flags.creditOnInterest;
  const hasHistory =
    !["none", "legacy_admin"].includes(family.status) || !["none", "disabled"].includes(chat.status);
  if (!canSend && !hasHistory) return null;

  async function confirm(consent: boolean) {
    if (!dialog || busy) return;
    setBusy(true);
    // Sender's consent is saved first; the receiver's goes with the accept call
    if (dialog.mode === "send" && consent) {
      const saved = await postJson("/api/profile/guardian-consent");
      if (!saved.ok) {
        setBusy(false);
        toast.error(saved.data.error ?? "تعذّر حفظ الموافقة");
        return;
      }
    }
    const res =
      dialog.mode === "send"
        ? await postJson<{ creditsLeft: number }>(`/api/matches/${matchId}/intro`, { type: dialog.type })
        : await postJson<{ status: string; conversationId?: string }>(
            `/api/intro-requests/${dialog.requestId}/respond`,
            { accept: dialog.mode === "accept", consent: consent || undefined }
          );
    setBusy(false);

    if (!res.ok) {
      if (res.data.code === "NO_CREDITS") {
        toast.error(res.data.error ?? "رصيدك غير كافٍ", {
          action: { label: "اشحن رصيدك", onClick: () => router.push("/dashboard/payments") },
        });
      } else {
        toast.error(res.data.error ?? "حدث خطأ، حاول مرة أخرى");
      }
      setDialog(null);
      load();
      return;
    }

    const sent = dialog.mode === "send";
    const conversationId = !sent ? (res.data as { conversationId?: string }).conversationId : undefined;
    toast.success(
      sent ? "تم إرسال الطلب" : dialog.mode === "accept" ? "تم قبول الطلب" : "تم الاعتذار عن الطلب",
      sent ? { description: `سنُعلمك عند رد ${partnerName}.` } : undefined
    );
    setDialog(null);
    await load();
    refreshUnread();
    if (conversationId) router.push(`/dashboard/chats/${conversationId}`);
  }

  /** Mixed outcome: the chat side agrees to share its guardian contact on this match */
  async function shareGuardian() {
    if (busy) return;
    setBusy(true);
    const res = await postJson<IntroState>(`/api/matches/${matchId}/guardian-share`, state?.myGuardian.consented ? {} : { consent: true });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.data.error ?? "تعذّر حفظ الموافقة، حاول مرة أخرى");
      return;
    }
    toast.success("تمت مشاركة بيانات وليّ أمرك مع عائلة الطرف الآخر");
    setState(res.data);
    refreshProfile();
    refreshUnread();
  }

  async function cancelRequest() {
    if (!cancelId || busy) return;
    setBusy(true);
    const res = await postJson(`/api/intro-requests/${cancelId}/cancel`);
    setBusy(false);
    setCancelId(null);
    if (!res.ok) toast.error(res.data.error ?? "تعذّر إلغاء الطلب، حاول مرة أخرى");
    else toast.success("تم إلغاء الطلب");
    await load();
    refreshUnread();
  }

  const cancelButton = (requestId?: string) =>
    requestId ? (
      <Button size="sm" variant="ghost" className="gap-1 text-muted-foreground" onClick={() => setCancelId(requestId)}>
        <X className="h-4 w-4" />
        إلغاء الطلب
      </Button>
    ) : null;

  // Family is the main (traditional) path; chat is offered as the secondary option.
  // With no credits the action becomes "top up" instead of opening a dialog that can't proceed.
  const sendButton = (type: "FAMILY" | "CHAT", freeOnce?: boolean) => {
    const free = freeOnce || freeRequests;
    return !free && state.credits <= 0 ? (
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <Link href="/dashboard/payments">
          <Coins className="h-4 w-4" />
          اشحن رصيدك للإرسال
        </Link>
      </Button>
    ) : (
      <Button
        size="sm"
        variant={type === "FAMILY" ? "default" : "outline"}
        onClick={() => setDialog({ mode: "send", type })}
        className="gap-1.5"
      >
        {free ? <Gift className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
        {free ? "إرسال الطلب مجاناً" : "إرسال الطلب"}
      </Button>
    );
  };

  const answerButtons = (type: "FAMILY" | "CHAT", requestId?: string) => (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => setDialog({ mode: "accept", type, requestId })}>
        قبول
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "decline", type, requestId })}>
        ليس الآن
      </Button>
    </div>
  );

  // Family tile
  let familyChip: React.ReactNode = null;
  let familyAction: React.ReactNode = null;
  switch (family.status) {
    case "none":
      familyAction = canSend ? sendButton("FAMILY", family.free) : null;
      break;
    case "pending_sent":
      familyChip = <Chip tone="amber" icon={Clock}>بانتظار الرد · {daysLabel(daysLeft(family.expiresAt))}</Chip>;
      familyAction = cancelButton(family.requestId);
      break;
    case "pending_received":
      familyChip = <Chip tone="accent" icon={Inbox}>وصلك طلب</Chip>;
      familyAction = answerButtons("FAMILY", family.requestId);
      break;
    case "accepted":
      familyChip = <Chip tone="emerald" icon={CheckCircle2}>تم التعارف العائلي</Chip>;
      break;
    case "declined":
      familyChip = <Chip tone="muted" icon={Ban}>{family.declinedByMe ? "تم الاعتذار من طرفك" : "لم يتم قبول الطلب"}</Chip>;
      break;
    case "legacy_admin":
      familyChip = <Chip tone="primary" icon={CalendarHeart}>فريق نصيبك يتابع الزيارة</Chip>;
      break;
    case "closed":
      familyChip = <Chip tone="muted" icon={Ban}>غير متاح بعد إنهاء المحادثة</Chip>;
      break;
  }

  // Chat tile
  let chatChip: React.ReactNode = null;
  let chatAction: React.ReactNode = null;
  switch (chat.status) {
    case "none":
      chatAction = canSend ? sendButton("CHAT") : null;
      break;
    case "pending_sent":
      chatChip = <Chip tone="amber" icon={Clock}>بانتظار الرد · {daysLabel(daysLeft(chat.expiresAt))}</Chip>;
      chatAction = cancelButton(chat.requestId);
      break;
    case "pending_received":
      chatChip = <Chip tone="accent" icon={Inbox}>وصلك طلب</Chip>;
      chatAction = answerButtons("CHAT", chat.requestId);
      break;
    case "open":
      chatChip = <Chip tone="emerald" icon={MessageCircle}>مفتوحة · متبقي {daysLabel(daysLeft(chat.expiresAt))}</Chip>;
      chatAction = (
        <Button asChild size="sm" className="gap-1.5">
          <Link href={`/dashboard/chats/${chat.conversationId}`}>
            فتح المحادثة
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      );
      break;
    case "ended":
    case "expired":
      chatChip = <Chip tone="muted" icon={Ban}>{chat.status === "ended" ? "انتهت المحادثة" : "انتهت مدة المحادثة"}</Chip>;
      chatAction = (
        <Button asChild size="sm" variant="outline">
          <Link href={`/dashboard/chats/${chat.conversationId}`}>عرض المحادثة</Link>
        </Button>
      );
      break;
    case "declined":
      chatChip = <Chip tone="muted" icon={Ban}>{chat.declinedByMe ? "تم الاعتذار من طرفك" : "لم يتم قبول الطلب"}</Chip>;
      break;
    case "disabled":
      chatChip = <Chip tone="muted" icon={Clock}>غير متاحة حالياً</Chip>;
      break;
  }

  const tiles = [
    {
      key: "FAMILY",
      icon: Users,
      title: "طلب تعارف عائلي",
      text: "تتبادل العائلتان بيانات وليّ الأمر لترتيب الزيارة.",
      chip: familyChip,
      action: familyAction,
      highlight: family.status === "pending_received",
    },
    {
      key: "CHAT",
      icon: MessageCircle,
      title: "محادثة قبل الزيارة",
      text: "محادثة نصية داخل نصيبك لمدة 14 يوماً للتعارف.",
      chip: chatChip,
      action: chatAction,
      highlight: chat.status === "pending_received",
    },
  ];

  const dialogType = dialog?.type ?? "FAMILY";
  const { outcome, myGuardian } = state;

  return (
    <section className="mt-4 rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.04] to-transparent p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-foreground">خطوات التعارف</h4>
        {freeRequests ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Gift className="h-3.5 w-3.5 text-accent" />
            الطلبات مجانية
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Coins className="h-3.5 w-3.5 text-accent" />
            رصيدك: <span className="font-bold text-foreground">{state.credits}</span>
          </span>
        )}
      </div>

      {/* Credit on interest: the match opened straight into the introduction both chose */}
      {((outcome === "CHAT" && chat.status === "open") || (outcome === "FAMILY" && family.status === "accepted")) && (
        <div
          role="status"
          className="mt-3 flex items-start gap-3 rounded-xl border border-emerald-200/60 bg-emerald-50/60 p-3 text-sm text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
        >
          <PartyPopper className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <p className="font-semibold">
            {outcome === "CHAT" ? "توافق متبادل! المحادثة مفتوحة الآن" : "توافق متبادل! تم مشاركة بيانات التواصل العائلي"}
          </p>
        </div>
      )}

      {/* Mixed outcome: the side that chose chat is asked to share its guardian contact on this match */}
      {myGuardian.askShare && (
        <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="font-semibold leading-relaxed text-foreground">
                {g(
                  "الطرف الآخر فضّل التعارف العائلي — هل توافق على مشاركة بيانات ولي أمرك؟",
                  "الطرف الآخر فضّل التعارف العائلي — هل توافقين على مشاركة بيانات ولي أمرك؟"
                )}
              </p>
              {!myGuardian.exists ? (
                <Link href="/dashboard/profile/edit?step=5" className="inline-block font-semibold underline underline-offset-4">
                  إضافة بيانات وليّ الأمر
                </Link>
              ) : (
                <>
                  {!myGuardian.consented && (
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={shareConsent}
                        onChange={(e) => setShareConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--primary)]"
                      />
                      <span className="leading-relaxed text-foreground/80">أوافق على مشاركة اسم ورقم ولي الأمر</span>
                    </label>
                  )}
                  <Button size="sm" onClick={shareGuardian} disabled={busy || (!myGuardian.consented && !shareConsent)} className="gap-1.5">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    مشاركة بيانات وليّ أمري
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <div
            key={t.key}
            className={cn(
              "flex flex-col gap-3 rounded-xl border bg-card p-4 transition-shadow",
              t.highlight ? "border-accent/50 shadow-md shadow-accent/10 ring-1 ring-accent/30" : "border-border/60"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/15">
                <t.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{t.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t.text}</p>
              </div>
            </div>
            {(t.chip || t.action) && (
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                {t.chip ?? <span />}
                {t.action}
              </div>
            )}
          </div>
        ))}
      </div>

      {family.status === "accepted" && (
        <div className="mt-3">
          <GuardianContactCard contact={family.contacts} partnerName={partnerName} />
        </div>
      )}

      {busy && !dialog && <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" />}

      <ConfirmActionDialog
        open={!!cancelId}
        onOpenChange={(o) => !o && setCancelId(null)}
        title="إلغاء الطلب"
        description={`سيُلغى طلبك ولن ${partnerFemale ? "تتمكن" : "يتمكن"} ${partnerName} من الرد عليه.${freeRequests ? "" : " لا يُسترجع الرصيد المستخدم لإرسال الطلب."}`}
        confirmLabel="إلغاء الطلب"
        destructive
        busy={busy}
        onConfirm={cancelRequest}
      />

      <IntroConfirmDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        mode={dialog?.mode ?? "send"}
        type={dialogType}
        partnerName={partnerName}
        credits={state.credits}
        free={freeRequests || (dialogType === "FAMILY" ? family.free : false)}
        freeNote={freeRequests ? FREE_REQUEST_NOTE : undefined}
        guardian={state.myGuardian}
        busy={busy}
        onConfirm={confirm}
      />
    </section>
  );
}
