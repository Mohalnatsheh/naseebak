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
import { matchesHref } from "@/lib/matches/links";

export function ChatList() {
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

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/chats")
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
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [reloadKey]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <PageHeader
        icon={MessageCircle}
        title="المحادثات"
        description="محادثات خاصة للتعارف قبل الزيارة العائلية، لمدة 14 يوماً."
      />

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
        // One list, messaging-app style: whole row taps through, unread in bold with a count
        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-card">
          {chats.map((c) => {
            const left = daysLeft(c.expiresAt);
            return (
              <li key={c.id}>
                <Link
                  href={`/dashboard/chats/${c.id}`}
                  aria-label={c.unread > 0 ? `${c.partner.firstName}، ${c.unread} رسائل غير مقروءة` : c.partner.firstName}
                  className={cn("flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-muted/40", c.unread > 0 && "bg-primary/[0.03]")}
                >
                  <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary" aria-hidden>
                    {c.partner.firstName.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-bold text-foreground">{c.partner.firstName}</span>
                        <VerifiedBadge verified={c.partner.isVerified} />
                      </span>
                      {c.lastMessage && (
                        <span className={cn("flex-shrink-0 text-xs", c.unread > 0 ? "font-semibold text-primary" : "text-muted-foreground")}>
                          {listTimeLabel(c.lastMessage.createdAt, country)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn("min-w-0 flex-1 truncate text-sm", c.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        {c.lastMessage
                          ? `${c.lastMessage.mine ? (female ? "أنتِ: " : "أنت: ") : ""}${c.lastMessage.body}`
                          : female ? "ابدئي المحادثة" : "ابدأ المحادثة"}
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

      {/* After the list: the chats come first on a phone */}
      {chats !== null && chats.length > 0 && <InstallAppCard context="chats" />}
    </div>
  );
}
