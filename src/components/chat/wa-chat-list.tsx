"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { ProBadge } from "@/components/shared/pro-badge";
import { LoadError } from "@/components/shared/load-error";
import { EmptyState } from "@/components/shared/line-art";
import { MemberAvatar, chatTimeFraction } from "@/components/shared/member-avatar";
import { useDashboardData } from "@/contexts/dashboard-context";
import { daysLeft } from "@/components/intro/intro-utils";
import { matchesHref } from "@/lib/matches/links";
import { arabicCount, cn } from "@/lib/utils";
import type { ChatSummary } from "@/lib/chat/service";
import { listTimeLabel } from "./chat-utils";
import { EXPIRY_SOON_DAYS, isActiveChat } from "./chat-look";
import type { ChatListData } from "./use-chat-list";

type Chip = "all" | "unread" | "ended";

/**
 * The WhatsApp-style chats list (switch `chat_whatsapp_layout`): a title, three chips («الكل», «غير مقروءة», «المنتهية»)
 * and one row per chat. `compact`: the desktop side pane beside an open chat, the open chat marked.
 */
export function WaChatList({ compact = false, activeId, data }: { compact?: boolean; activeId?: string | null; data: ChatListData }) {
  const { chats, loadFailed, reload } = data;
  const { counts, profile, country } = useDashboardData();
  const female = profile?.gender === "FEMALE";
  const [chip, setChip] = useState<Chip>("all");
  // An ended chat open in two panes: its chip is the one shown first (once, when the list first knows it)
  const [chipFor, setChipFor] = useState<string | null>(null);
  if (activeId && chats && chipFor !== activeId) {
    const open = chats.find((c) => c.id === activeId);
    if (open) {
      setChipFor(activeId);
      setChip(isActiveChat(open) ? "all" : "ended");
    }
  }

  const Heading = compact && activeId ? "h2" : "h1";
  const title = <Heading className="px-1 pt-1 text-xl font-bold text-foreground">المحادثات</Heading>;

  if (chats === null && loadFailed) {
    return (
      <div className="space-y-4 pb-8">
        {title}
        <LoadError message="تعذّر تحميل المحادثات. يمكنك التحقق من الاتصال والمحاولة مرة أخرى." onRetry={reload} />
      </div>
    );
  }
  if (chats === null) {
    return (
      <div className="space-y-4 pb-8">
        {title}
        <div role="status" className="flex min-h-[50vh] justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <span className="sr-only">جارٍ التحميل…</span>
        </div>
      </div>
    );
  }
  if (chats.length === 0) {
    return (
      <div className="space-y-4 pb-8">
        {title}
        <EmptyState
          art="cupsTray"
          title="لا توجد محادثات بعد"
          description={
            counts.flags.creditOnInterest
              ? "تُفتح المحادثة تلقائياً عندما يختار كلاكما «محادثة هنا أولاً» عند «مهتم»، أو بطلب محادثة من صفحة التوافقات."
              : female
                ? "أرسلي طلب محادثة من صفحة التوافقات. تُفتح المحادثة عند قبول الطرف الآخر."
                : "أرسل طلب محادثة من صفحة التوافقات. تُفتح المحادثة عند قبول الطرف الآخر."
          }
        >
          <Button asChild variant="neutral" className="h-11 gap-1.5 rounded-xl">
            <Link href={matchesHref(counts.flags.mutualSuggestions)}>
              <Heart className="h-4 w-4" /> التوافقات
            </Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const active = chats.filter(isActiveChat);
  const unreadChats = active.filter((c) => c.unread > 0);
  const endedChats = chats.filter((c) => !isActiveChat(c));
  const shown = chip === "all" ? active : chip === "unread" ? unreadChats : endedChats;
  const chips: { key: Chip; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "unread", label: unreadChats.length > 0 ? `غير مقروءة ${unreadChats.length}` : "غير مقروءة" },
    { key: "ended", label: "المنتهية" },
  ];
  const emptyText: Record<Chip, string> = {
    all: "لا توجد محادثات نشطة",
    unread: "لا توجد رسائل غير مقروءة",
    ended: "لا توجد محادثات منتهية",
  };

  return (
    <div className={compact ? "flex h-full flex-col gap-3" : "space-y-4 pb-8"}>
      {title}
      <div className="flex flex-wrap gap-2 px-1">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={chip === c.key}
            onClick={() => setChip(c.key)}
            className={cn(
              "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors motion-reduce:transition-none",
              chip === c.key ? "bg-primary text-primary-foreground" : "bg-chat-chip text-foreground hover:bg-muted"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className={cn(compact && "min-h-0 flex-1 overflow-y-auto")}>
        {shown.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-muted-foreground">{emptyText[chip]}</p>
        ) : (
          <ul>
            {shown.map((c) => (
              <WaChatRow key={c.id} c={c} current={c.id === activeId} female={female} country={country} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function WaChatRow({ c, current, female, country }: { c: ChatSummary; current: boolean; female: boolean; country: unknown }) {
  const open = isActiveChat(c);
  const left = daysLeft(c.expiresAt);
  const soon = open && left <= EXPIRY_SOON_DAYS;
  const unread = open && c.unread > 0;
  const last = c.lastMessage;
  return (
    <li>
      <Link
        href={`/dashboard/chats/${c.id}`}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 px-3 py-3 transition-colors hover:bg-muted/40 motion-reduce:transition-none",
          current && "bg-primary/10 hover:bg-primary/10",
          !open && "opacity-70"
        )}
      >
        <MemberAvatar
          name={c.partner.firstName}
          size={52}
          matched={false}
          dimmed={!open}
          pro={!!c.partner.isPro}
          timeLeft={open ? chatTimeFraction(c.expiresAt) : null}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-bold text-foreground">{c.partner.firstName}</span>
              <VerifiedBadge verified={c.partner.isVerified} />
              {c.partner.isPro && <ProBadge />}
            </span>
            {last && (
              <span className={cn("flex-shrink-0 text-xs", unread ? "font-semibold text-primary" : "text-muted-foreground")}>
                {listTimeLabel(last.createdAt, country)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn("flex min-w-0 flex-1 items-center gap-1 text-sm", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {last?.mine &&
                (last.read ? (
                  <CheckCheck className="h-4 w-4 flex-shrink-0 text-primary" aria-label="تمت القراءة" />
                ) : (
                  <Check className="h-4 w-4 flex-shrink-0" aria-label="تم الإرسال" />
                ))}
              <span className="truncate">
                {last ? <bdi>{last.body}</bdi> : !open ? "لا توجد رسائل" : female ? "ابدئي المحادثة" : "ابدأ المحادثة"}
              </span>
            </span>
            {unread && (
              <>
                <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-bold tabular-nums text-primary-foreground" aria-hidden>
                  {c.unread > 99 ? "99+" : c.unread}
                </span>
                <span className="sr-only">
                  {"، "}
                  {arabicCount(c.unread, { one: "رسالة غير مقروءة", two: "رسالتان غير مقروءتين", few: "رسائل غير مقروءة", many: "رسالة غير مقروءة" })}
                </span>
              </>
            )}
          </span>
          {soon && (
            <span className="mt-0.5 block text-caption font-semibold text-destructive">
              {left <= 0 ? "باقي أقل من يوم" : `باقي ${arabicCount(left, { one: "يوم", two: "يومان", few: "أيام", many: "يوماً" })}`}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
