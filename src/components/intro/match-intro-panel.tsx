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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import type { IntroState } from "@/lib/intro/requests";
import { IntroConfirmDialog, type IntroDialogMode } from "./intro-confirm-dialog";
import { GuardianContactCard } from "./guardian-contact-card";
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

/**
 * "خطوات التعارف" on a mutual match: family introduction and chat requests.
 * Renders nothing while the new cycle switch is off.
 */
export function MatchIntroPanel({ matchId, partnerName }: { matchId: string; partnerName: string }) {
  const router = useRouter();
  const { refreshUnread } = useDashboardData();
  const [state, setState] = useState<IntroState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busy, setBusy] = useState(false);

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

  if (!state || !state.flags.introRequests) return null;
  const { family, chat } = state;

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

  const sendButton = (type: "FAMILY" | "CHAT", free?: boolean) => (
    <Button size="sm" onClick={() => setDialog({ mode: "send", type })} className="gap-1.5">
      {free ? <Gift className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
      {free ? "إرسال الطلب مجاناً" : "إرسال الطلب"}
    </Button>
  );

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
      familyAction = sendButton("FAMILY", family.free);
      break;
    case "pending_sent":
      familyChip = <Chip tone="amber" icon={Clock}>بانتظار الرد · {daysLabel(daysLeft(family.expiresAt))}</Chip>;
      break;
    case "pending_received":
      familyChip = <Chip tone="accent" icon={Inbox}>وصلك طلب</Chip>;
      familyAction = answerButtons("FAMILY", family.requestId);
      break;
    case "accepted":
      familyChip = <Chip tone="emerald" icon={CheckCircle2}>تم التعارف العائلي</Chip>;
      break;
    case "declined":
      familyChip = <Chip tone="muted" icon={Ban}>{family.declinedByMe ? "اعتذرتَ عن الطلب" : "لم يتم قبول الطلب"}</Chip>;
      break;
    case "legacy_admin":
      familyChip = <Chip tone="primary" icon={CalendarHeart}>فريق نصيبك يتابع الزيارة</Chip>;
      break;
  }

  // Chat tile
  let chatChip: React.ReactNode = null;
  let chatAction: React.ReactNode = null;
  switch (chat.status) {
    case "none":
      chatAction = sendButton("CHAT");
      break;
    case "pending_sent":
      chatChip = <Chip tone="amber" icon={Clock}>بانتظار الرد · {daysLabel(daysLeft(chat.expiresAt))}</Chip>;
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
      chatChip = <Chip tone="muted" icon={Ban}>{chat.declinedByMe ? "اعتذرتَ عن الطلب" : "لم يتم قبول الطلب"}</Chip>;
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
      text: "محادثة نصية داخل نصيبك لمدة ١٤ يوماً للتعارف.",
      chip: chatChip,
      action: chatAction,
      highlight: chat.status === "pending_received",
    },
  ];

  const dialogType = dialog?.type ?? "FAMILY";

  return (
    <section className="mt-4 rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.04] to-transparent p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-foreground">خطوات التعارف</h4>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Coins className="h-3.5 w-3.5 text-accent" />
          رصيدك: <span className="font-bold text-foreground">{state.credits}</span>
        </span>
      </div>

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

      <IntroConfirmDialog
        open={!!dialog}
        onOpenChange={(o) => !o && setDialog(null)}
        mode={dialog?.mode ?? "send"}
        type={dialogType}
        partnerName={partnerName}
        credits={state.credits}
        free={dialogType === "FAMILY" ? family.free : false}
        guardian={state.myGuardian}
        busy={busy}
        onConfirm={confirm}
      />
    </section>
  );
}
