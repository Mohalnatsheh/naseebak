"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Loader2, Clock, Lock, Heart, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "@/lib/chat/service";
import { daysLabel, daysLeft } from "@/components/intro/intro-utils";
import { listTimeLabel } from "./chat-utils";

export function ChatList() {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/chats")
        .then((r) => (r.ok ? r.json() : { conversations: [] }))
        .then((d) => alive && setChats(d.conversations ?? []))
        .catch(() => alive && setChats([]));
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-l from-primary/10 via-primary/5 to-transparent p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/20">
            <MessageCircle className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="bg-gradient-to-l from-primary to-secondary bg-clip-text text-2xl font-bold text-transparent">المحادثات</h1>
            <p className="text-sm text-muted-foreground">محادثات خاصة للتعارف قبل الزيارة العائلية، لمدة ١٤ يوماً.</p>
          </div>
        </div>
      </div>

      {chats === null ? (
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
                أرسل طلب محادثة من صفحة التوافقات. تُفتح المحادثة عند قبول الطرف الآخر.
              </p>
            </div>
            <Button asChild variant="outline" className="gap-1.5">
              <Link href="/dashboard/matches">
                <Heart className="h-4 w-4" /> الذهاب إلى التوافقات
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {chats.map((c) => {
            const left = daysLeft(c.expiresAt);
            return (
              <Link key={c.id} href={`/dashboard/chats/${c.id}`} className="block">
                <Card
                  className={cn(
                    "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5",
                    c.unread > 0 ? "border-primary/30" : "border-border/50"
                  )}
                >
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="relative flex h-13 w-13 flex-shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/15 to-accent/15">
                      <span className="text-xl font-bold text-primary">{c.partner.firstName.charAt(0)}</span>
                      {c.unread > 0 && (
                        <span className="absolute -top-1.5 -left-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground ring-2 ring-card">
                          {c.unread > 99 ? "99+" : c.unread}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-bold text-foreground">{c.partner.firstName}</span>
                          <VerifiedBadge verified={c.partner.isVerified} />
                        </div>
                        {c.lastMessage && (
                          <span className="flex-shrink-0 text-xs text-muted-foreground">{listTimeLabel(c.lastMessage.createdAt)}</span>
                        )}
                      </div>
                      <p className={cn("mt-0.5 truncate text-sm", c.unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        {c.lastMessage ? `${c.lastMessage.mine ? "أنت: " : ""}${c.lastMessage.body}` : "ابدأ المحادثة"}
                      </p>
                      <div className="mt-1.5">
                        {c.status === "ACTIVE" ? (
                          <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold", left <= 3 ? "text-amber-700" : "text-muted-foreground")}>
                            <Clock className="h-3 w-3" /> متبقي {daysLabel(left)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                            <Lock className="h-3 w-3" /> {c.status === "ENDED" ? "منتهية" : "انتهت المدة"}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronLeft className="h-5 w-5 flex-shrink-0 text-muted-foreground/50" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
