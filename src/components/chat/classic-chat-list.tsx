"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Loader2, Clock, Lock, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { arabicCount, cn } from "@/lib/utils";
import { daysLabel, daysLeft } from "@/components/intro/intro-utils";
import { listTimeLabel } from "./chat-utils";
import { useDashboardData } from "@/contexts/dashboard-context";
import { LoadError } from "@/components/shared/load-error";
import { PageHeader } from "@/components/shared/page-header";
import { matchesHref } from "@/lib/matches/links";
import { ProBadge } from "@/components/shared/pro-badge";
import { isActiveChat, splitChats, type ChatTab } from "./chat-look";
import { MemberAvatar } from "@/components/shared/member-avatar";
import { EmptyState } from "@/components/shared/line-art";
import type { ChatListData } from "./use-chat-list";

/**
 * Today's chats list (switch `chat_whatsapp_layout` off), in two tabs: «النشطة» (open chats, first) and «المنتهية» (read-only), each with its unread total.
 * `compact`: the desktop side pane beside an open chat (≥1024 px): no page header or app card, the open chat marked.
 */
export function ClassicChatList({ compact = false, activeId, data }: { compact?: boolean; activeId?: string | null; data: ChatListData }) {
  const { chats, loadFailed, reload } = data;
  const { counts, profile, country } = useDashboardData();
  const female = profile?.gender === "FEMALE";
  const [tab, setTab] = useState<ChatTab>("active");
  // Two panes with an ended chat open: its tab is the one shown first (once, when the list first knows it)
  const [tabFor, setTabFor] = useState<string | null>(null);
  if (activeId && chats && tabFor !== activeId) {
    const open = chats.find((c) => c.id === activeId);
    if (open) {
      setTabFor(activeId);
      setTab(isActiveChat(open) ? "active" : "ended");
    }
  }

  return (
    <div className={compact ? "flex h-full flex-col gap-3" : "space-y-6 pb-8"}>
      {compact ? (
        // The page's h1 while no chat is open beside it (the open chat's name is the h1 then, QA PA-L1)
        (() => {
          const Heading = activeId ? "h2" : "h1";
          return (
            <Heading className="flex items-center gap-2 px-1 pt-1 text-lg font-bold text-foreground">
              <MessageCircle className="h-5 w-5 text-primary" aria-hidden /> المحادثات
            </Heading>
          );
        })()
      ) : (
        <PageHeader
          icon={MessageCircle}
          title="المحادثات"
          description="محادثات خاصة للتعارف قبل الزيارة العائلية، لمدة 14 يوماً."
        />
      )}

      {chats === null && loadFailed ? (
        <LoadError
          message="تعذّر تحميل المحادثات. يمكنك التحقق من الاتصال والمحاولة مرة أخرى."
          onRetry={reload}
        />
      ) : chats === null ? (
        <div role="status" className="flex min-h-[50vh] justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <span className="sr-only">جارٍ التحميل…</span>
        </div>
      ) : chats.length === 0 ? (
        <EmptyState art="cupsTray" title="لا توجد محادثات بعد" description={<>{counts.flags.creditOnInterest
                  ? "تُفتح المحادثة تلقائياً عندما يختار كلاكما «محادثة هنا أولاً» عند «مهتم»، أو بطلب محادثة من صفحة التوافقات."
                  : female
                    ? "أرسلي طلب محادثة من صفحة التوافقات. تُفتح المحادثة عند قبول الطرف الآخر."
                    : "أرسل طلب محادثة من صفحة التوافقات. تُفتح المحادثة عند قبول الطرف الآخر."}</>}>
          <Button asChild variant="neutral" className="h-11 gap-1.5 rounded-xl">
              <Link href={matchesHref(counts.flags.mutualSuggestions)}>
                <Heart className="h-4 w-4" /> التوافقات
              </Link>
            </Button>
        </EmptyState>
      ) : (
        (() => {
          const split = splitChats(chats);
          const shown = tab === "active" ? split.active : split.ended;
          const tabs: { key: ChatTab; label: string; unread: number }[] = [
            { key: "active", label: "النشطة", unread: split.activeUnread },
            { key: "ended", label: "المنتهية", unread: split.endedUnread },
          ];
          return (
            <div className={cn("overflow-hidden rounded-2xl border border-border/60 bg-card", compact && "flex min-h-0 flex-1 flex-col")}>
              <div role="tablist" aria-label="المحادثات" className="grid grid-cols-2 border-b border-border/60">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    role="tab"
                    id={`chats-tab-${t.key}`}
                    aria-selected={tab === t.key}
                    aria-controls="chats-tabpanel"
                    tabIndex={tab === t.key ? 0 : -1}
                    onClick={() => setTab(t.key)}
                    onKeyDown={(e) => {
                      // Two tabs: either arrow moves to the other one (roving focus)
                      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                      e.preventDefault();
                      const other: ChatTab = t.key === "active" ? "ended" : "active";
                      setTab(other);
                      document.getElementById(`chats-tab-${other}`)?.focus();
                    }}
                    className={cn(
                      "flex min-h-11 items-center justify-center gap-1.5 border-b-2 text-sm font-bold transition-colors",
                      tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t.label}
                    {t.unread > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-bold tabular-nums text-primary-foreground">
                        {t.unread > 99 ? "99+" : t.unread}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id="chats-tabpanel" aria-labelledby={`chats-tab-${tab}`} className={cn(compact && "min-h-0 flex-1 overflow-y-auto")}>
                {shown.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="font-semibold text-foreground">{tab === "active" ? "لا توجد محادثات نشطة" : "لا توجد محادثات منتهية"}</p>
                    <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                      {tab === "active"
                        ? "تظهر هنا المحادثات المفتوحة بعد التوافق المتبادل."
                        : "تظهر هنا المحادثات التي انتهت مدتها أو أُنهيت، للقراءة فقط."}
                    </p>
                  </div>
                ) : (
        // One list, messaging-app style: whole row taps through, unread in bold with a count
        <ul className="divide-y divide-border/60">
          {shown.map((c) => {
            const left = daysLeft(c.expiresAt);
            const current = c.id === activeId;
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/chats/${c.id}`}
                  aria-current={current ? "page" : undefined}
                  // No aria-label: the row reads as it shows — name, time, preview, unread, time left (QA WC2-13)
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-muted/40",
                    c.unread > 0 && "bg-primary/[0.03]",
                    current && "bg-primary/10 hover:bg-primary/10"
                  )}
                >
                  <MemberAvatar name={c.partner.firstName} size={48} matched={c.status === "ACTIVE"} dimmed={c.status !== "ACTIVE"} pro={!!c.partner.isPro} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-bold text-foreground">{c.partner.firstName}</span>
                        <VerifiedBadge verified={c.partner.isVerified} />
                        {c.partner.isPro && <ProBadge />}
                      </span>
                      {c.lastMessage && (
                        <span className={cn("flex-shrink-0 text-xs", c.unread > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
                          {listTimeLabel(c.lastMessage.createdAt, country)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-sm", c.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        {c.lastMessage ? (
                          <>
                            {c.lastMessage.mine ? (female ? "أنتِ: " : "أنت: ") : ""}
                            <bdi>{c.lastMessage.body}</bdi>
                          </>
                        ) : female ? (
                          "ابدئي المحادثة"
                        ) : (
                          "ابدأ المحادثة"
                        )}
                      </span>
                      {c.unread > 0 && (
                        <>
                          <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-caption font-bold tabular-nums text-primary-foreground" aria-hidden>
                            {c.unread > 99 ? "99+" : c.unread}
                          </span>
                          <span className="sr-only">
                            {"، "}
                            {arabicCount(c.unread, { one: "رسالة غير مقروءة", two: "رسالتان غير مقروءتين", few: "رسائل غير مقروءة", many: "رسالة غير مقروءة" })}
                            {"، "}
                          </span>
                        </>
                      )}
                    </span>
                    <span className="mt-1 block">
                      {c.status === "ACTIVE" ? (
                        <span className={cn("inline-flex items-center gap-1 text-caption font-semibold", left <= 3 ? "text-amber-700" : "text-muted-foreground")}>
                          <Clock className="h-3 w-3" aria-hidden /> متبقي {daysLabel(left)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-caption font-semibold text-muted-foreground">
                          <Lock className="h-3 w-3" aria-hidden /> {c.status === "ENDED" ? "منتهية" : "انتهت المدة"}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
                )}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
