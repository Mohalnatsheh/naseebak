"use client";

import Link from "next/link";
import { ArrowRight, CalendarPlus, Clock, Eraser, Flag, Lock, MoreVertical, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VerifiedBadge } from "@/components/shared/verified-badge";
import { ProBadge } from "@/components/shared/pro-badge";
import { MemberAvatar, chatTimeFraction } from "@/components/shared/member-avatar";
import { SealMark } from "@/components/shared/match-seal";
import { daysLabel } from "@/components/intro/intro-utils";
import { cn } from "@/lib/utils";
import { EXPIRY_SOON_DAYS } from "./chat-look";
import { TimeArcButton } from "./time-arc-button";
import type { ChatRoomModel, ChatRoomReady } from "./use-chat-room";

/**
 * The WhatsApp-style top bar (switch `chat_whatsapp_layout`): back (phones), the avatar with the time arc, the name with
 * its marks and a subtitle, then one ⋮ menu: the days left, «صفحة التوافق», «تمديد 7 أيام», «مسح المحادثة», then the
 * destructive «إبلاغ» and «إنهاء المحادثة». Same handlers and rules as today's header.
 */
export function WaChatHeader({ model, ready }: { model: ChatRoomModel; ready: ChatRoomReady }) {
  const { mode, optionsButton, returnFocus: returnFocusRef, busy, deleteMode, chatDelete, setExtendConfirm, setEndDialog, setReportMessage } = model;
  const { conversation, open, left, endable, typingLabel, activity } = ready;
  const name = conversation.partner.firstName;
  const matchHref = `/dashboard/matches?match=${conversation.matchId}`;

  const who = (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate font-bold leading-tight text-foreground">{name}</h1>
        {!conversation.matchHidden && <SealMark size={16} />}
        <VerifiedBadge verified={conversation.partner.isVerified} />
        {conversation.partner.isPro && <ProBadge />}
      </div>
      {/* Not a live region: typing on / off every few seconds would be read out each time */}
      <p
        data-testid="chat-status-line"
        className={cn(
          "mt-0.5 flex items-center gap-1 truncate text-xs",
          typingLabel || activity ? "font-semibold text-primary" : open && left <= EXPIRY_SOON_DAYS ? "font-semibold text-amber-700" : "text-muted-foreground"
        )}
      >
        {typingLabel ? (
          <span>{typingLabel}</span>
        ) : activity ? (
          activity
        ) : (
          <>
            {open ? <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {open ? `متبقي ${daysLabel(left)}` : conversation.status === "ENDED" ? "المحادثة منتهية" : "انتهت مدة المحادثة"}
          </>
        )}
        {mode === "live" && <span className="ms-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="متصل" />}
      </p>
    </div>
  );
  // Outside the match link: no button inside a link
  const avatar = (
    <TimeArcButton
      daysLeftLabel={open ? `متبقي ${daysLabel(left)}` : null}
      avatar={
        <MemberAvatar
          name={name}
          size={42}
          matched={!open}
          dimmed={!open}
          timeLeft={open ? chatTimeFraction(conversation.expiresAt) : null}
        />
      }
    />
  );
  const fromMenu = (then: () => void) => () => {
    returnFocusRef.current = optionsButton.current;
    then();
  };

  return (
    <header className="flex min-h-14 items-center gap-1 border-b border-border/60 bg-card px-1 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] sm:px-3">
      <Button asChild variant="ghost" size="icon" aria-label="رجوع" className="size-11 shrink-0 lg:hidden">
        <Link href="/dashboard/chats">
          <ArrowRight className="h-5 w-5" />
        </Link>
      </Button>
      {conversation.matchHidden ? (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {avatar}
          {who}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {avatar}
          <Link
            href={matchHref}
            aria-label={`عرض توافق ${name}`}
            className="-my-1 flex min-h-11 min-w-0 flex-1 items-center rounded-xl px-1 transition-colors hover:bg-muted/50"
          >
            {who}
          </Link>
        </div>
      )}
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <Button ref={optionsButton} variant="ghost" size="icon" aria-label="خيارات المحادثة" className="size-11 shrink-0">
            <MoreVertical className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {open && (
            <>
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden /> متبقي {daysLabel(left)} على المحادثة
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {!conversation.matchHidden && (
            <DropdownMenuItem asChild className="min-h-11">
              <Link href={matchHref}>
                <Users className="h-4 w-4" /> صفحة التوافق
              </Link>
            </DropdownMenuItem>
          )}
          {conversation.canExtend && (
            <DropdownMenuItem className="min-h-11" onClick={fromMenu(() => setExtendConfirm(true))} disabled={busy}>
              <CalendarPlus className="h-4 w-4" /> تمديد 7 أيام
            </DropdownMenuItem>
          )}
          {deleteMode && (
            <DropdownMenuItem className="min-h-11" onClick={fromMenu(() => chatDelete.requestClear())}>
              <Eraser className="h-4 w-4" /> مسح المحادثة
              {deleteMode === "upsell" && <Lock className="ms-auto h-3.5 w-3.5 text-muted-foreground" aria-label="ميزة Pro" />}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            className="min-h-11"
            onClick={fromMenu(() => {
              setReportMessage(null);
              setEndDialog("report");
            })}
          >
            <Flag className="h-4 w-4" /> إبلاغ
          </DropdownMenuItem>
          {endable && (
            <DropdownMenuItem variant="destructive" className="min-h-11" onClick={fromMenu(() => setEndDialog("end"))}>
              <XCircle className="h-4 w-4" /> إنهاء المحادثة
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
