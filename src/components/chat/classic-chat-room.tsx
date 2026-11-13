"use client";

import { Fragment } from "react";
import Link from "next/link";
import {
  ArrowRight,
  MoreVertical,
  Clock,
  ShieldCheck,
  Users,
  CalendarPlus,
  XCircle,
  Flag,
  Loader2,
  Lock,
  ChevronDown,
  WifiOff,
  Eraser,
} from "lucide-react";
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
import { arabicCount, cn } from "@/lib/utils";
import { FREE_REQUEST_NOTE, IntroConfirmDialog } from "@/components/intro/intro-confirm-dialog";
import { daysLabel } from "@/components/intro/intro-utils";
import { MessageBubble } from "./message-bubble";
import { ChatComposer } from "./chat-composer";
import { PhotoViewer } from "./photo-viewer";
import { emptyChatHint } from "./chat-interactions";
import { EndChatDialog } from "./end-chat-dialog";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import { dayLabel } from "./chat-utils";
import { EXPIRY_SOON_DAYS, chatRowLayout, endedChatNote, groupByDay } from "./chat-look";
import { ChatStatusBar } from "./chat-status-bar";
import { ProOfferDialog } from "@/components/payments/pro-offer-dialog";
import { MemberAvatar, chatTimeFraction } from "@/components/shared/member-avatar";
import { SealMark } from "@/components/shared/match-seal";
import { TimeArcButton } from "./time-arc-button";
import type { ChatRoomModel } from "./use-chat-room";

/** One pill for the day labels and «رسائل جديدة» (P2-1) */
export const CHAT_PILL = "rounded-full bg-card/95 px-3 py-1 text-caption font-semibold text-muted-ink shadow-sm ring-1 ring-border/50";

/** Today's chat room (switch `chat_whatsapp_layout` off): the view of `useChatRoom`'s model */
export function ClassicChatRoom({ model }: { model: ChatRoomModel }) {
  const {
    router, messages, notFound, loadError, hasMore, loadingOlder, online, mode, viewport, scroller, composer, optionsButton,
    // `…Ref`: the React Compiler lint allows setting `.current` on a ref passed in only under a ref's name
    returnFocus: returnFocusRef, activeRowId, familyOpenUntil, family, familyFree, intro, deleteMode, myGender, country, starters,
    refusal, setRefusal, composerError, setComposerError, replyTo, setReplyTo, highlightId, unreadFromId, away, unseen,
    viewerId, setViewerId, busy, endDialog, setEndDialog, extendConfirm, setExtendConfirm, familyDialog, setFamilyDialog,
    offerOpen, setOfferOpen, reportMessage, setReportMessage, pushChip, chatDelete,
    send, sendMedia, fetchLatest, loadOlder, onScroll, extend, end, requestFamily, typing, wake, setActiveRow,
  } = model;

  if (notFound) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-semibold">المحادثة غير موجودة</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/dashboard/chats">العودة للمحادثات</Link>
        </Button>
      </div>
    );
  }

  if (!model.conversation && loadError) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="font-semibold">تعذّر تحميل المحادثة</p>
        <p className="mt-1 text-sm text-muted-foreground">يمكنك التحقق من اتصالك والمحاولة مرة أخرى.</p>
        <Button variant="outline" className="mt-4" onClick={() => fetchLatest("replace")}>
          إعادة المحاولة
        </Button>
      </div>
    );
  }

  if (!model.ready) {
    return (
      <div role="status" className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
        <span className="sr-only">جارٍ التحميل…</span>
      </div>
    );
  }

  const {
    conversation, left, open, canSend, endable, familyStep, statusBar, activity, typingLabel, startersShown, closedFamily,
    composerMedia, messageActions, viewerPhotos,
  } = model.ready;

  return (
    <div
      // Phones: full screen over the dashboard bar, sized to the visible area so the keyboard never covers the box
      style={viewport ? { height: viewport.height, top: viewport.top } : undefined}
      className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden bg-card max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-50 max-md:h-[100dvh] md:h-[calc(100dvh-4rem)] md:rounded-2xl md:border md:border-border/60 md:shadow-sm lg:max-w-none"
    >
      {/* Header: who, and how long the chat stays open */}
      <header className="flex items-center gap-2 border-b border-border/60 px-2 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] sm:px-4">
        {/* Desktop shows the list beside the chat: no way back needed there */}
        <Button asChild variant="ghost" size="icon" aria-label="رجوع" className="size-11 shrink-0 lg:hidden">
          <Link href="/dashboard/chats">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        {(() => {
          const who = (
            <>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="truncate font-bold leading-tight text-foreground">{conversation.partner.firstName}</h1>
                  {/* The match's seal (S1), small; gone with the match */}
                  {!conversation.matchHidden && <SealMark size={16} />}
                  <VerifiedBadge verified={conversation.partner.isVerified} />
                  {conversation.partner.isPro && <ProBadge />}
                </div>
                {/* The status line: «يكتب الآن…» while the partner types, else the activity label («نشط اليوم») in an
                    open chat, else the time left / why it's closed */}
                {/* Not a live region: typing on / off every few seconds would be read out each time */}
                <p data-testid="chat-status-line" className={cn("mt-0.5 flex items-center gap-1 truncate text-xs", typingLabel || activity ? "font-semibold text-primary" : open && left <= EXPIRY_SOON_DAYS ? "font-semibold text-amber-700" : "text-muted-foreground")}>
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
            </>
          );
          // The partner's avatar with the chat's days as a gold arc (S4); «متبقي N أيام» on tap or hover. It sits
          // outside the match link (no button inside a link). One Pro marker in the header: the badge by the name.
          const avatar = (
            <TimeArcButton
              daysLeftLabel={open ? `متبقي ${daysLabel(left)}` : null}
              avatar={
                <MemberAvatar
                  name={conversation.partner.firstName}
                  size={42}
                  matched={!open}
                  dimmed={!open}
                  // No end date (or none left): the plain avatar, never an empty gold track (review X4b minor 7)
                  timeLeft={open ? chatTimeFraction(conversation.expiresAt) : null}
                />
              }
            />
          );
          // Tapping the name opens the match (not for someone the other person blocked)
          return conversation.matchHidden ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {avatar}
              {who}
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {avatar}
            <Link
              href={`/dashboard/matches?match=${conversation.matchId}`}
              aria-label={`عرض توافق ${conversation.partner.firstName}`}
              className="-my-1 flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-1 transition-colors hover:bg-muted/50"
            >
              {who}
            </Link>
            </div>
          );
        })()}
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button ref={optionsButton} variant="ghost" size="icon" aria-label="خيارات المحادثة" className="size-11 shrink-0">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* The days left, which the status line doesn't show while it carries the activity label */}
            {open && (
              <>
                <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> متبقي {daysLabel(left)} على المحادثة
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
              </>
            )}
            {conversation.canExtend && (
              <DropdownMenuItem
                onClick={() => {
                  returnFocusRef.current = optionsButton.current;
                  setExtendConfirm(true);
                }}
                disabled={busy}
              >
                <CalendarPlus className="h-4 w-4" /> تمديد 7 أيام
              </DropdownMenuItem>
            )}
            {!conversation.matchHidden && (
              <DropdownMenuItem asChild>
                <Link href={`/dashboard/matches?match=${conversation.matchId}`}>
                  <Users className="h-4 w-4" /> عرض التوافق
                </Link>
              </DropdownMenuItem>
            )}
            {deleteMode && (
              <DropdownMenuItem
                onClick={() => {
                  returnFocusRef.current = optionsButton.current;
                  chatDelete.requestClear();
                }}
              >
                <Eraser className="h-4 w-4" /> مسح المحادثة
                {deleteMode === "upsell" && <Lock className="ms-auto h-3.5 w-3.5 text-muted-foreground" aria-label="ميزة Pro" />}
              </DropdownMenuItem>
            )}
            {endable && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    returnFocusRef.current = optionsButton.current;
                    setEndDialog("end");
                  }}
                >
                  <XCircle className="h-4 w-4" /> إنهاء المحادثة
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                returnFocusRef.current = optionsButton.current;
                setReportMessage(null);
                setEndDialog("report");
              }}
            >
              <Flag className="h-4 w-4" /> إبلاغ
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Offline: failed messages go out again by themselves when the connection is back */}
      {!online && (
        <p role="status" className="flex min-h-9 items-center justify-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold text-amber-800">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          لا يوجد اتصال بالإنترنت. تُرسل رسائلك عند عودة الاتصال.
        </p>
      )}
      {/* One slim bar, by priority: ending soon, the family step, the push chip (QA WC-07) */}
      <ChatStatusBar
        bar={statusBar}
        daysLeft={left}
        canExtend={conversation.canExtend}
        busy={busy}
        onExtend={() => setExtendConfirm(true)}
        family={familyStep}
        onFamily={() => setFamilyDialog(true)}
        matchHref={`/dashboard/matches?match=${conversation.matchId}`}
        viewerGender={myGender}
        pushBlocked={pushChip.blocked}
        onPushDismiss={pushChip.dismiss}
      />

      {/* Messages */}
      {canSend && (
        // Past the whole thread in one step (QA WC2-06 / PA-M7)
        <a
          href="#chat-composer"
          onClick={(e) => {
            e.preventDefault();
            composer.current?.focus();
          }}
          className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-20 focus:z-30 focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:font-bold focus:text-primary-foreground"
        >
          الانتقال إلى مربع الرسالة
        </a>
      )}
      <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        onScroll={onScroll}
        // New messages are read out as they arrive (additions only: reactions and read ticks are not read out, review X3
        // minor 1); who wrote each is in the bubble (QA WC2-05)
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`المحادثة مع ${conversation.partner.firstName}`}
        aria-busy={loadingOlder}
        data-message-list=""
        // The «majlis» (S3, P2-1): warm sand with the gold star at 4%, as in the app
        className="majlis h-full overflow-y-auto overscroll-contain px-1.5 py-3 sm:px-4"
      >
        {/* Shown once at the top of every chat (most members chat on phones) */}
        <p className="mx-auto mb-1 flex w-fit max-w-full items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm ring-1 ring-border/50">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          {myGender === "FEMALE" ? "محادثة خاصة · لا تشاركي الأرقام أو الحسابات" : "محادثة خاصة · لا تشارك الأرقام أو الحسابات"}
        </p>
        {hasMore && (
          <div className="mb-2 text-center">
            <Button variant="outline" size="xs" onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
              تحميل رسائل أقدم
            </Button>
          </div>
        )}

        {messages.length === 0 && canSend && (
          <p className="mx-auto mt-8 max-w-xs rounded-xl bg-card/90 px-4 py-3 text-center text-sm text-muted-foreground shadow-sm">
            {emptyChatHint({ female: myGender === "FEMALE", starters: startersShown && !viewport?.keyboard })}
          </p>
        )}
        {messages.length === 0 && !canSend && (
          <p className="py-10 text-center text-sm text-muted-foreground">لا توجد رسائل في هذه المحادثة.</p>
        )}

        {/* One section per day: its date chip stays at the top while that day scrolls by */}
        {groupByDay(messages).map((day) => (
          <section key={day.key} className="pb-1">
            <div className="sticky top-1 z-10 my-2 flex justify-center">
              <span className={CHAT_PILL}>
                {dayLabel(day.items[0].createdAt, country)}
              </span>
            </div>
            {day.items.map((m, k) => {
              const layout = chatRowLayout(messages, day.first + k, unreadFromId);
              return (
                <Fragment key={m.id}>
                  {layout.unreadDivider && (
                    <div data-unread-divider role="separator" className="my-3 flex justify-center">
                      <span className={cn(CHAT_PILL, "text-primary")}>رسائل جديدة</span>
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    rowActive={activeRowId === m.id}
                    onRowFocus={setActiveRow}
                    tail={layout.tail}
                    onRetry={() => (m.upload ? sendMedia(m.upload, m.id, m.replyTo) : send(m.body, m.id, m.replyTo))}
                    actions={messageActions}
                    partnerName={conversation.partner.firstName}
                    highlighted={highlightId === m.id}
                  />
                </Fragment>
              );
            })}
          </section>
        ))}

        {/* The filter refused a message: a note in the thread, and the way contact details are shared — the family
            introduction (chat design P1, QA WC2-04) */}
        {refusal && (
          <div
            data-testid="chat-refusal"
            // Inside the log: read out once as an addition (a nested alert was read twice, review X3 minor 1)
            className="mx-auto my-3 max-w-sm rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-center text-sm leading-relaxed text-foreground shadow-sm"
          >
            <p className="flex items-start justify-center gap-1.5">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-accent-ink" aria-hidden />
              <span>{refusal}</span>
            </p>
            {canSend && familyStep === "offer" ? (
              <Button size="sm" onClick={() => setFamilyDialog(true)} className="mt-2 min-h-11 gap-1.5">
                <Users className="h-4 w-4" aria-hidden="true" /> تعارف عائلي
              </Button>
            ) : familyStep && familyStep !== "offer" && !conversation.matchHidden ? (
              <Link
                href={`/dashboard/matches?match=${conversation.matchId}`}
                className="mt-1 inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline"
              >
                التعارف العائلي في صفحة التوافق
              </Link>
            ) : null}
          </div>
        )}
      </div>
        {/* Back to the newest message after scrolling up (with what arrived meanwhile) */}
        {away && (
          <button
            type="button"
            onClick={() => model.jumpToNewest()}
            aria-label={
              unseen > 0
                ? `${arabicCount(unseen, { one: "رسالة جديدة", two: "رسالتان جديدتان", few: "رسائل جديدة", many: "رسالة جديدة" })} · الانتقال لآخر رسالة`
                : "الانتقال لآخر رسالة"
            }
            className="absolute bottom-3 end-3 flex h-11 w-11 items-center justify-center rounded-full border border-border/60 bg-card text-primary shadow-lg transition-transform active:scale-95"
          >
            <ChevronDown className="h-5 w-5" aria-hidden />
            {unseen > 0 && (
              <span aria-hidden className="absolute -top-1.5 -start-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-caption font-bold text-accent-foreground">
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Composer or read-only notice */}
      {canSend ? (
        <ChatComposer
          ref={composer}
          female={myGender === "FEMALE"}
          keyboardOpen={!!viewport?.keyboard}
          onSend={(t) => send(t)}
          error={composerError}
          onTyping={() => {
            if (composerError) setComposerError(null);
            if (refusal) setRefusal(null);
            typing.notify();
            // Polling (no Ably): someone composing is in a live exchange, so the next poll comes at the fast pace
            // (it brings their «يكتب الآن…» and the reply sooner). A wake never postpones a poll already due
            wake();
          }}
          media={composerMedia}
          replyTo={replyTo}
          partnerName={conversation.partner.firstName}
          onCancelReply={() => setReplyTo(null)}
          starters={startersShown ? starters : []}
        />
      ) : (
        <div className="border-t border-border/60 bg-muted/30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground">
          {conversation.blocked
            ? "لا يمكن إرسال رسائل في هذه المحادثة."
            : intro?.chat.paused
            ? "المحادثة متوقفة مؤقتاً لمراجعة من فريق نصيبك. سنُعلمك عند استئنافها."
            : conversation.status === "ENDED"
            ? endedChatNote(conversation)
            : conversation.status === "EXPIRED"
              ? family?.status === "none" && intro?.flags.introRequests && !intro.closed
                ? `انتهت مدة المحادثة. هل تنتقلان لتعارف عائلي؟${familyFree ? " الانتقال مجاني" : ""}${familyOpenUntil ? ` ومتاح حتى ${familyOpenUntil}` : ""}.`
                : "انتهت مدة المحادثة."
              : "المحادثات متوقفة مؤقتاً. يمكنك قراءة الرسائل السابقة."}
          {/* An expired chat keeps its family links: a request on its way, one received, guardian details */}
          {conversation.status === "EXPIRED" && !conversation.blocked && closedFamily && (
            <p className="mt-1.5 font-semibold text-primary">
              {closedFamily.link ? (
                <Link href={`/dashboard/matches?match=${conversation.matchId}`} className="inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline">
                  {closedFamily.text}
                </Link>
              ) : (
                closedFamily.text
              )}
            </p>
          )}
          {/* An expired chat keeps the free move to family: offer it right here */}
          {conversation.status === "EXPIRED" && !conversation.blocked && family?.status === "none" && intro?.flags.introRequests && !intro.closed && (
            <div className="mt-2">
              <Button size="sm" onClick={() => setFamilyDialog(true)} className="gap-1.5">
                <Users className="h-4 w-4" aria-hidden="true" /> ننتقل لتعارف عائلي
              </Button>
            </div>
          )}
        </div>
      )}

      <ProOfferDialog open={offerOpen} onOpenChange={setOfferOpen} />
      {chatDelete.dialogs}
      <IntroConfirmDialog
        open={familyDialog}
        onOpenChange={setFamilyDialog}
        mode="send"
        type="FAMILY"
        partnerName={conversation.partner.firstName}
        credits={intro?.credits ?? 0}
        free={familyFree}
        freeNote={intro?.flags.creditOnInterest ? FREE_REQUEST_NOTE : undefined}
        guardian={intro?.myGuardian ?? { exists: false, consented: false }}
        busy={busy}
        onConfirm={requestFamily}
      />
      <ConfirmActionDialog
        returnFocus={returnFocusRef}
        open={extendConfirm}
        onOpenChange={(o) => !busy && setExtendConfirm(o)}
        title="تمديد المحادثة 7 أيام؟"
        description="يمكن تمديد المحادثة مرة واحدة فقط، فتبقى مفتوحة 7 أيام إضافية لكليكما."
        confirmLabel="تمديد 7 أيام"
        busy={busy}
        onConfirm={extend}
      />
      <PhotoViewer photos={viewerPhotos} openId={viewerId} onClose={() => setViewerId(null)} />
      <EndChatDialog
        returnFocus={returnFocusRef}
        open={!!endDialog}
        onOpenChange={(o) => {
          if (o) return;
          setEndDialog(null);
          setReportMessage(null);
        }}
        reportedMessage={reportMessage?.snippet}
        report={endDialog === "report"}
        partnerName={conversation.partner.firstName}
        familyStatus={intro?.flags.introRequests && !intro.closed ? family?.status : undefined}
        busy={busy}
        ended={!endable}
        onConfirm={(report) => {
          // «إبلاغ فقط» stays in the chat; a report that ends or blocks goes back to the list
          end(report).then((ok) => ok && report?.end && router.push("/dashboard/chats"));
        }}
      />
    </div>
  );
}
