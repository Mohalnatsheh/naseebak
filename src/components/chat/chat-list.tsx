"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Loader2, Clock, Lock, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "@/lib/chat/service";
import { daysLabel, daysLeft } from "@/components/intro/intro-utils";
import { listTimeLabel } from "./chat-utils";
import { InstallAppCard } from "@/components/shared/install-app-card";
import { useDashboardData } from "@/contexts/dashboard-context";
import { LoadError } from "@/components/shared/load-error";
import { PageHeader } from "@/components/shared/page-header";
import { markPageNotificationsRead } from "@/lib/notifications-client";
import { sharedGet } from "@/lib/shared-get";
import { matchesHref } from "@/lib/matches/links";
import { ProBadge } from "@/components/shared/pro-badge";
import { isActiveChat, splitChats, type ChatTab } from "./chat-look";

/**
 * The chats, in two tabs: «النشطة» (open chats, first) and «المنتهية» (read-only), each with its unread total.
 * `compact`: the desktop side pane beside an open chat (≥1024 px): no page header or app card, the open chat marked.
 */
export function ChatList({ compact = false, activeId }: { compact?: boolean; activeId?: string | null } = {}) {
  // Opening this page clears the bell for the notifications that lead here
  useEffect(() => {
    markPageNotificationsRead("/dashboard/chats", { exact: true });
  }, []);

  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  // Only the first load can fail visibly; a failed refresh keeps the list already on screen
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const loaded = useRef(false);
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

  // No poll of its own (QA WC2-07, PA-M6): the list reloads when the dashboard's badges or bell change (they poll every
  // 30 s, only while the tab is visible), when something was read, after my own send, and back on the tab. A hidden
  // tab never polls, and with Ably live nothing extra runs. Loads go through sharedGet, so overlapping triggers share
  // one request.
  const { unreadCount } = useDashboardData();
  const reloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () =>
      sharedGet("/api/chats")
        .then((r) => {
          if (!r.ok) throw new Error(`chats ${r.status}`);
          return r.json();
        })
        .then((d) => {
          if (!alive) return;
          loaded.current = true;
          setChats(d.conversations ?? []);
          setLoadFailed(false);
        })
        .catch(() => {
          if (alive && !loaded.current) setLoadFailed(true);
        });
    // A burst of triggers (a read, then the badges it changed) is one reload
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void load();
      }, 300);
    };
    reloadRef.current = soon;
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    load();
    window.addEventListener("naseeb:notifications-read", soon);
    window.addEventListener("naseeb:chat-sent", soon);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      reloadRef.current = () => {};
      window.removeEventListener("naseeb:notifications-read", soon);
      window.removeEventListener("naseeb:chat-sent", soon);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadKey]);

  // A new message elsewhere moves the unread badge or the bell: reload then (skipping the first render)
  const seen = useRef<string | null>(null);
  useEffect(() => {
    const key = `${counts.unreadChats}:${unreadCount}`;
    if (seen.current !== null && seen.current !== key) reloadRef.current();
    seen.current = key;
  }, [counts.unreadChats, unreadCount]);

  return (
    <div className={compact ? "flex h-full flex-col gap-3" : "mx-auto max-w-3xl space-y-6 pb-8"}>
      {compact ? (
        <h2 className="flex items-center gap-2 px-1 pt-1 text-lg font-bold text-foreground">
          <MessageCircle className="h-5 w-5 text-primary" aria-hidden /> المحادثات
        </h2>
      ) : (
        <PageHeader
          icon={MessageCircle}
          title="المحادثات"
          description="محادثات خاصة للتعارف قبل الزيارة العائلية، لمدة 14 يوماً."
        />
      )}

      {chats === null && loadFailed ? (
        <LoadError
          message="تعذّر تحميل المحادثات. تحقّق من الاتصال وحاول مرة أخرى."
          onRetry={() => {
            setLoadFailed(false);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : chats === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : chats.length === 0 ? (
        <Card className="border-2 border-dashed border-muted-foreground/20">
          <CardContent className="space-y-4 py-14 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/5">
              <MessageCircle className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">لا توجد محادثات بعد</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                {counts.flags.creditOnInterest
                  ? "تُفتح المحادثة تلقائياً عندما يختار كلاكما «محادثة هنا أولاً» عند «مهتم»، أو بطلب محادثة من صفحة التوافقات."
                  : female
                    ? "أرسلي طلب محادثة من صفحة التوافقات. تُفتح المحادثة عند قبول الطرف الآخر."
                    : "أرسل طلب محادثة من صفحة التوافقات. تُفتح المحادثة عند قبول الطرف الآخر."}
              </p>
            </div>
            <Button asChild variant="outline" className="gap-1.5">
              <Link href={matchesHref(counts.flags.mutualSuggestions)}>
                <Heart className="h-4 w-4" /> التوافقات المتبادلة
              </Link>
            </Button>
          </CardContent>
        </Card>
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
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground">
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
                  aria-label={c.unread > 0 ? `${c.partner.firstName}، ${c.unread} رسائل غير مقروءة` : c.partner.firstName}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-muted/40",
                    c.unread > 0 && "bg-primary/[0.03]",
                    current && "bg-primary/10 hover:bg-primary/10"
                  )}
                >
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary" aria-hidden>
                    {c.partner.firstName.charAt(0)}
                  </span>
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
                        <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground" aria-hidden>
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block">
                      {c.status === "ACTIVE" ? (
                        <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", left <= 3 ? "text-amber-700" : "text-muted-foreground")}>
                          <Clock className="h-3 w-3" aria-hidden /> متبقي {daysLabel(left)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
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

      {/* After the list (the chats come first on a phone). The only notifications prompt on this page: the
          dashboard's notification bar stays off here */}
      {chats !== null && !compact && <InstallAppCard context="chats" />}
    </div>
  );
}
