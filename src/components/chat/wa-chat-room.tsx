"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, ShieldCheck, Users, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { arabicCount, cn } from "@/lib/utils";
import { FREE_REQUEST_NOTE, IntroConfirmDialog } from "@/components/intro/intro-confirm-dialog";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import { ProOfferDialog } from "@/components/payments/pro-offer-dialog";
import { PhotoViewer } from "./photo-viewer";
import { emptyChatHint } from "./chat-interactions";
import { EndChatDialog } from "./end-chat-dialog";
import { dayLabel, type UiMessage } from "./chat-utils";
import { chatRowLayout, groupByDay } from "./chat-look";
import { ChatStatusBar } from "./chat-status-bar";
import { WaMessageBubble } from "./wa-message-bubble";
import { WaReactionPicker, WaSelectionBar, selectedMessage } from "./wa-selection";
import { WaComposer } from "./wa-composer";
import { unreadStripLabel } from "./wa-chat-logic";
import { WaChatHeader } from "./wa-chat-header";
import { WaReadOnlyFooter } from "./wa-chat-footer";
import type { ChatRoomModel } from "./use-chat-room";

/** How long the floating date chip stays after scrolling stops (Android) */
const DATE_CHIP_HIDE_MS = 1000;
/** Room above a selected row for the reaction pill; less and it opens below the row */
const PICKER_ROOM_PX = 64;

const DAY_CHIP = "rounded-lg bg-chat-chip px-3 py-1 text-caption font-semibold text-muted-ink shadow-sm";

/**
 * The WhatsApp-style chat room (switch `chat_whatsapp_layout`), the view of `useChatRoom`'s model. A long press (or
 * right-click, the hover chevron, Enter on a row) selects one message: the selection bar replaces the top bar and the
 * reaction pill floats over the row. The selection ends on Escape, ✕, a tap on the thread's background, any action,
 * another chat, or when the message has nothing left to offer (deleted, the chat closed).
 */
export function WaChatRoom({ model }: { model: ChatRoomModel }) {
  const {
    router, messages, notFound, loadError, hasMore, loadingOlder, online, viewport, scroller, composer,
    returnFocus: returnFocusRef, activeRowId, familyFree, intro, myGender, country, starters, refusal, setRefusal,
    composerError, setComposerError, replyTo, setReplyTo, highlightId, unreadFromId, away, unseen, viewerId, setViewerId,
    busy, endDialog, setEndDialog, extendConfirm, setExtendConfirm, familyDialog, setFamilyDialog, offerOpen, setOfferOpen,
    reportMessage, setReportMessage, pushChip, chatDelete, send, sendMedia, fetchLatest, loadOlder, extend, end,
    requestFamily, typing, wake, setActiveRow, conversationId,
  } = model;

  // The selected message: its id, for this chat only (another chat in the same pane starts with none)
  const [sel, setSel] = useState<{ chat: string; id: string; below: boolean } | null>(null);
  const selection = sel && sel.chat === conversationId ? sel : null;
  const selected = model.ready && selection ? selectedMessage(messages, selection.id, model.ready.messageActions) : null;
  // Gone, deleted, or nothing left to do with it: the selection ends (it never comes back by itself later)
  if (sel && !selected) setSel(null);

  // The date chip that floats at the top fades out a second after scrolling stops
  const [stuckDay, setStuckDay] = useState<string | null>(null);
  const [chipsIdle, setChipsIdle] = useState(true);
  const chipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (chipTimer.current) clearTimeout(chipTimer.current);
  }, []);

  const rowEl = (id: string) => scroller.current?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`) ?? null;

  /** Ends the selection; the focus goes back to the row when it was left nowhere (the bar's ✕ unmounted) */
  function clearSelection() {
    const id = selection?.id;
    setSel(null);
    if (!id) return;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) rowEl(id)?.focus();
    });
  }

  const escapeClears = !!selected;
  useEffect(() => {
    if (!escapeClears) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setSel(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [escapeClears]);

  function select(m: UiMessage) {
    const el = scroller.current;
    const row = rowEl(m.id);
    const below = !!el && !!row && row.getBoundingClientRect().top - el.getBoundingClientRect().top < PICKER_ROOM_PX;
    setSel({ chat: conversationId, id: m.id, below });
  }

  function handleScroll() {
    model.onScroll();
    const el = scroller.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    let stuck: string | null = null;
    for (const section of Array.from(el.querySelectorAll<HTMLElement>("section[data-day]"))) {
      if (section.getBoundingClientRect().top < top) stuck = section.dataset.day ?? null;
    }
    setStuckDay(stuck);
    setChipsIdle(false);
    if (chipTimer.current) clearTimeout(chipTimer.current);
    chipTimer.current = setTimeout(() => setChipsIdle(true), DATE_CHIP_HIDE_MS);
  }

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

  const ready = model.ready;
  const { conversation, canSend, endable, familyStep, statusBar, left, startersShown, composerMedia, messageActions, viewerPhotos } = ready;
  const partnerName = conversation.partner.firstName;
  const unreadAt = unreadFromId ? messages.findIndex((m) => m.id === unreadFromId) : -1;
  const unreadCount = unreadAt < 0 ? 0 : messages.slice(unreadAt).filter((m) => !m.mine).length;

  return (
    <div
      // Phones: full screen over the dashboard bar, sized to the visible area so the keyboard never covers the box
      style={viewport ? { height: viewport.height, top: viewport.top } : undefined}
      className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden bg-card max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-50 max-md:h-[100dvh] md:h-[calc(100dvh-4rem)] md:rounded-2xl md:border md:border-border/60 md:shadow-sm lg:max-w-none"
    >
      {selected ? (
        <div className="bg-primary pt-[env(safe-area-inset-top)]">
          <WaSelectionBar
            message={selected}
            actions={messageActions}
            onClose={clearSelection}
            onDelete={(m) => {
              // The bar is gone once the dialog closes: the focus goes back to the message's row
              returnFocusRef.current = rowEl(m.id);
              chatDelete.requestDeleteChoice(m);
            }}
          />
        </div>
      ) : (
        <WaChatHeader model={model} ready={ready} />
      )}

      {!online && (
        <p role="status" className="flex min-h-9 items-center justify-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold text-amber-800">
          <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
          لا يوجد اتصال بالإنترنت. تُرسل رسائلك عند عودة الاتصال.
        </p>
      )}
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

      {canSend && (
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
          onScroll={handleScroll}
          onClick={(e) => {
            // A tap on the thread's background (not a bubble, not the reaction pill) ends the selection
            if (selection && !(e.target as Element).closest?.("[data-wa-bubble],[data-wa-picker]")) clearSelection();
          }}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label={`المحادثة مع ${partnerName}`}
          aria-busy={loadingOlder}
          data-message-list=""
          className="majlis h-full overflow-y-auto overscroll-contain bg-sand px-1.5 py-3 sm:px-4"
        >
          <p className="mx-auto mb-2 flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-safety-chip px-3 py-1.5 text-center text-xs text-accent-ink shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
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

          {groupByDay(messages).map((day) => (
            <section key={day.key} data-day={day.key} className="pb-1">
              <div className="sticky top-1 z-10 my-2 flex justify-center">
                <span
                  className={cn(
                    DAY_CHIP,
                    "transition-opacity duration-300 motion-reduce:transition-none",
                    stuckDay === day.key && chipsIdle && "opacity-0"
                  )}
                >
                  {dayLabel(day.items[0].createdAt, country)}
                </span>
              </div>
              {day.items.map((m, k) => {
                const layout = chatRowLayout(messages, day.first + k, unreadFromId);
                const isSelected = selected?.id === m.id;
                return (
                  <Fragment key={m.id}>
                    {layout.unreadDivider && unreadCount > 0 && (
                      <div
                        data-unread-divider
                        role="separator"
                        className="-mx-1.5 my-3 bg-chat-chip py-1.5 text-center text-caption font-semibold text-primary shadow-sm sm:-mx-4"
                      >
                        {unreadStripLabel(unreadCount)}
                      </div>
                    )}
                    <div className="relative">
                      {isSelected && (
                        <div
                          data-wa-picker=""
                          className={cn(
                            "absolute z-20",
                            selection?.below ? "top-full mt-1" : "bottom-full mb-1",
                            m.mine ? "start-3" : "end-3"
                          )}
                        >
                          <WaReactionPicker message={m} actions={messageActions} onPicked={clearSelection} />
                        </div>
                      )}
                      <WaMessageBubble
                        message={m}
                        tail={layout.tail}
                        partnerName={partnerName}
                        actions={messageActions}
                        selected={isSelected}
                        highlighted={highlightId === m.id}
                        rowActive={activeRowId === m.id}
                        onRowFocus={setActiveRow}
                        onSelect={select}
                        onRetry={() => (m.upload ? sendMedia(m.upload, m.id, m.replyTo) : send(m.body, m.id, m.replyTo))}
                        onDismissFailed={() => model.dismissFailed(m.id)}
                        // The pill: the selection, with my own reaction ringed in the picker (tap it again to remove)
                        onReactionsTap={select}
                      />
                    </div>
                  </Fragment>
                );
              })}
            </section>
          ))}

          {refusal && (
            <div
              data-testid="chat-refusal"
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
        {away && (
          <button
            type="button"
            onClick={() => model.jumpToNewest()}
            aria-label={
              unseen > 0
                ? `${arabicCount(unseen, { one: "رسالة جديدة", two: "رسالتان جديدتان", few: "رسائل جديدة", many: "رسالة جديدة" })} · الانتقال لآخر رسالة`
                : "الانتقال لآخر رسالة"
            }
            className="absolute bottom-3 end-3 flex size-11 items-center justify-center rounded-full bg-card text-muted-foreground shadow-md ring-1 ring-border/60 transition-transform active:scale-95 motion-reduce:transition-none"
          >
            <ChevronDown className="h-5 w-5" aria-hidden />
            {unseen > 0 && (
              <span aria-hidden className="absolute -top-1.5 -start-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-caption font-bold text-primary-foreground">
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </button>
        )}
      </div>

      {canSend ? (
        <WaComposer
          ref={composer}
          female={myGender === "FEMALE"}
          keyboardOpen={!!viewport?.keyboard}
          onSend={(t) => send(t)}
          error={composerError}
          onTyping={() => {
            if (composerError) setComposerError(null);
            if (refusal) setRefusal(null);
            typing.notify();
            wake();
          }}
          media={composerMedia}
          replyTo={replyTo}
          partnerName={partnerName}
          onCancelReply={() => setReplyTo(null)}
          starters={startersShown ? starters : []}
        />
      ) : (
        <WaReadOnlyFooter model={model} ready={ready} />
      )}

      <ProOfferDialog open={offerOpen} onOpenChange={setOfferOpen} />
      {chatDelete.dialogs}
      <IntroConfirmDialog
        open={familyDialog}
        onOpenChange={setFamilyDialog}
        mode="send"
        type="FAMILY"
        partnerName={partnerName}
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
        partnerName={partnerName}
        familyStatus={intro?.flags.introRequests && !intro.closed ? model.family?.status : undefined}
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
