"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import Link from "next/link";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmActionDialog } from "@/components/intro/confirm-action-dialog";
import { postJson } from "@/components/intro/intro-utils";
import { returnFocusTo } from "@/lib/dialog-focus";
import { PRO_PAGE_PATH } from "@/lib/pro/plans";
import type { DeleteScope } from "@/lib/chat/visibility";
import { applyDeletions, dropHidden } from "./chat-interactions";
import { mergeMessages, type UiMessage } from "./chat-utils";

/**
 * Chat delete on the website (Pro): «حذف لديّ» / «حذف لدى الجميع» on a message, «مسح المحادثة» in the header. Nothing is
 * erased (reports and admins keep the original), nobody is told, the chat stays open. The server checks every rule
 * again (Pro, own message, open chat for «لدى الجميع»).
 */

/** The server's wording for PRO_REQUIRED (src/lib/chat/delete.ts, which client code can't import) */
export const DELETE_PRO_ONLY = "حذف الرسائل ومسح المحادثة متاح لأعضاء Pro";
export const DELETE_EVERYONE_CONFIRM = "ستُحذف الرسالة لديك ولدى الطرف الآخر، ويظهر مكانها «تم حذف الرسالة».";
export const CLEAR_ME_CONFIRM = "ستُمسح الرسائل من عندك فقط، ويبقى كل شيء لدى الطرف الآخر.";
export const CLEAR_EVERYONE_CONFIRM = "ستُمسح كل رسائل هذه المحادثة لديك ولدى الطرف الآخر. تبقى المحادثة مفتوحة ويمكنكما متابعة الكتابة.";

export type DeleteEntryMode = "use" | "upsell" | null;

/** What a chat GET answer says about deletions (any of it may be absent: older pages, older servers) */
export type DeleteFields = { hiddenIds?: string[]; deletedIds?: string[]; clearedBefore?: string | null };

type Ask =
  | { kind: "message"; message: UiMessage }
  | { kind: "clear"; scope: DeleteScope | null }
  | { kind: "choice"; message: UiMessage };

/** The later of two ISO times (either may be null) */
function laterOf(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a;
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

export function useChatDelete({
  conversationId,
  mode,
  canEveryone,
  messagesRef,
  setMessages,
  setHasMore,
  hasMoreRef,
  returnFocus,
  onProRequired,
  onRefused,
}: {
  conversationId: string;
  mode: DeleteEntryMode;
  /** «لدى الجميع» (message and clear): only in a chat I can still write in */
  canEveryone: boolean;
  messagesRef: RefObject<UiMessage[]>;
  setMessages: Dispatch<SetStateAction<UiMessage[]>>;
  setHasMore: (v: boolean) => void;
  hasMoreRef: RefObject<boolean>;
  returnFocus?: RefObject<HTMLElement | null>;
  /** PRO_REQUIRED: load the Pro state again (as the media buttons do) */
  onProRequired: () => void;
  /** DISABLED / NOT_ALLOWED / EXPIRED: the chat's state changed, load it again */
  onRefused: () => void;
}) {
  // My own deletions sent and not answered (or answered): a poll already on its way never shows them again
  const deleting = useRef(new Set<string>());
  const hiding = useRef(new Set<string>());
  // My clear point: the server's (`clearedBefore`), a live `cleared` event, or my own clear on its way
  const cutoff = useRef<string | null>(null);
  useEffect(() => {
    deleting.current = new Set();
    hiding.current = new Set();
    cutoff.current = null;
  }, [conversationId]);

  const [ask, setAsk] = useState<Ask | null>(null);
  // The Pro offer's text, or null when closed
  const [upsell, setUpsell] = useState<string | null>(null);

  /** A server answer (or none) and my own deletions applied to a list: hides and the clear point, then the traces */
  const settle = useCallback((list: UiMessage[], srv?: DeleteFields): UiMessage[] => {
    cutoff.current = laterOf(cutoff.current, srv?.clearedBefore);
    const kept = dropHidden(list, [...(srv?.hiddenIds ?? []), ...hiding.current], cutoff.current);
    return applyDeletions(kept, [...(srv?.deletedIds ?? []), ...deleting.current]);
  }, []);

  /** Everything older than the clear point is gone on the server too: no «تحميل رسائل أقدم» */
  const dropOlderPagesBefore = useCallback(
    (before: string | null, list: UiMessage[]) => {
      const first = list.find((m) => !m.pending);
      if (before && hasMoreRef.current && (!first || Date.parse(first.createdAt) <= Date.parse(before))) setHasMore(false);
    },
    [hasMoreRef, setHasMore]
  );

  const onDeleted = useCallback(
    (e: { messageId: string }) => setMessages((prev) => applyDeletions(prev, [e.messageId])),
    [setMessages]
  );
  const onCleared = useCallback(
    (e: { before: string }) => {
      dropOlderPagesBefore(e.before, messagesRef.current);
      cutoff.current = laterOf(cutoff.current, e.before);
      setMessages((prev) => dropHidden(prev, [], e.before));
    },
    [dropOlderPagesBefore, messagesRef, setMessages]
  );

  function refused(res: { status: number; data: { error?: string; code?: string } }, fallback: string) {
    if (res.data.code === "PRO_REQUIRED") {
      setUpsell(res.data.error ?? DELETE_PRO_ONLY);
      onProRequired();
      return;
    }
    toast.error(res.data.error ?? fallback);
    if (res.data.code === "DISABLED" || res.data.code === "NOT_ALLOWED" || res.data.code === "EXPIRED") onRefused();
  }

  /** Puts back the copies in `before` of the messages in `ids` (and of the ones quoting them) */
  function restore(before: UiMessage[], ids: ReadonlySet<string>) {
    const touched = new Set(before.filter((m) => ids.has(m.id) || (m.replyTo && ids.has(m.replyTo.id))).map((m) => m.id));
    setMessages((prev) => mergeMessages(prev.filter((m) => !touched.has(m.id)), before.filter((m) => touched.has(m.id))));
  }

  async function deleteMessage(m: UiMessage, scope: DeleteScope) {
    const before = messagesRef.current;
    const set = scope === "everyone" ? deleting.current : hiding.current;
    set.add(m.id);
    setMessages((prev) => settle(prev));
    const res = await postJson<{ ok: true }>(`/api/chats/${conversationId}/messages/${m.id}/delete`, { scope });
    if (res.ok) return;
    set.delete(m.id);
    restore(before, new Set([m.id]));
    refused(res, "تعذّر حذف الرسالة");
  }

  async function clearChat(scope: DeleteScope) {
    const before = messagesRef.current;
    const prevCutoff = cutoff.current;
    const prevHasMore = hasMoreRef.current;
    // Until the server answers: everything loaded (its own clock decides the real point, never this device's)
    let newest: string | null = null;
    for (let i = before.length - 1; i >= 0; i--) {
      if (!before[i].pending) {
        newest = before[i].createdAt;
        break;
      }
    }
    cutoff.current = laterOf(cutoff.current, newest);
    setMessages((prev) => settle(prev));
    setHasMore(false);
    const res = await postJson<{ clearedBefore: string }>(`/api/chats/${conversationId}/clear`, { scope });
    if (res.ok) {
      setMessages((prev) => settle(prev, { clearedBefore: res.data.clearedBefore }));
      return;
    }
    cutoff.current = prevCutoff;
    restore(before, new Set(before.map((m) => m.id)));
    setHasMore(prevHasMore);
    refused(res, "تعذّر مسح المحادثة");
  }

  /** From the message menu: the offer (non-Pro), a confirm («لدى الجميع»), or at once («لديّ») */
  function requestDelete(m: UiMessage, scope: DeleteScope) {
    if (mode === "upsell") return setUpsell(DELETE_PRO_ONLY);
    if (mode !== "use") return;
    if (scope === "everyone") setAsk({ kind: "message", message: m });
    else void deleteMessage(m, "me");
  }

  /**
   * From the WhatsApp-style selection bar: the offer (non-Pro), or one dialog «حذف الرسالة؟» whose choice deletes at
   * once (no second confirm). «حذف لدى الجميع» only on my own live message in a chat I can still write in.
   */
  function requestDeleteChoice(m: UiMessage) {
    if (mode === "upsell") return setUpsell(DELETE_PRO_ONLY);
    if (mode === "use") setAsk({ kind: "choice", message: m });
  }

  /** From the header: the offer (non-Pro), or the choice «مسح لديّ» / «مسح لدى الجميع» */
  function requestClear() {
    if (mode === "upsell") return setUpsell(DELETE_PRO_ONLY);
    if (mode === "use") setAsk({ kind: "clear", scope: null });
  }

  const dialogs = (
    <>
      <ConfirmActionDialog
        returnFocus={returnFocus}
        open={ask?.kind === "message"}
        onOpenChange={(o) => !o && setAsk(null)}
        title="حذف الرسالة لدى الجميع؟"
        description={DELETE_EVERYONE_CONFIRM}
        confirmLabel="حذف لدى الجميع"
        destructive
        onConfirm={() => {
          if (ask?.kind === "message") void deleteMessage(ask.message, "everyone");
          setAsk(null);
        }}
      />
      <ClearChatDialog
        open={ask?.kind === "clear"}
        scope={ask?.kind === "clear" ? ask.scope : null}
        canEveryone={canEveryone}
        returnFocus={returnFocus}
        onChoose={(scope) => setAsk({ kind: "clear", scope })}
        onClose={() => setAsk(null)}
        onConfirm={(scope) => {
          setAsk(null);
          void clearChat(scope);
        }}
      />
      <DeleteMessageChoiceDialog
        open={ask?.kind === "choice"}
        // Read when shown: a chat that closed meanwhile drops «لدى الجميع» (as «مسح المحادثة» does)
        canEveryone={ask?.kind === "choice" && ask.message.mine && canEveryone && !ask.message.deleted}
        returnFocus={returnFocus}
        onClose={() => setAsk(null)}
        onChoose={(scope) => {
          if (ask?.kind === "choice") void deleteMessage(ask.message, scope);
          setAsk(null);
        }}
      />
      <DeleteUpsellDialog text={upsell} onClose={() => setUpsell(null)} returnFocus={returnFocus} />
    </>
  );

  return { settle, onDeleted, onCleared, requestDelete, requestDeleteChoice, requestClear, dialogs };
}

/** «مسح المحادثة»: first the choice, then its confirm text (one dialog, two steps) */
function ClearChatDialog({
  open,
  scope,
  canEveryone,
  returnFocus,
  onChoose,
  onClose,
  onConfirm,
}: {
  open: boolean;
  scope: DeleteScope | null;
  canEveryone: boolean;
  returnFocus?: RefObject<HTMLElement | null>;
  onChoose: (scope: DeleteScope) => void;
  onClose: () => void;
  onConfirm: (scope: DeleteScope) => void;
}) {
  // «لدى الجميع» chosen while the chat was open, then it closed: back to «لديّ» only
  const step = scope === "everyone" && !canEveryone ? null : scope;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="text-right sm:max-w-md" onCloseAutoFocus={returnFocus ? returnFocusTo(returnFocus) : undefined}>
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-lg">
            {step === "me" ? "مسح المحادثة لديك؟" : step === "everyone" ? "مسح المحادثة لدى الجميع؟" : "مسح المحادثة"}
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            {step === "me"
              ? CLEAR_ME_CONFIRM
              : step === "everyone"
                ? CLEAR_EVERYONE_CONFIRM
                : canEveryone
                  ? "يمكنك مسح الرسائل من عندك فقط، أو لديك ولدى الطرف الآخر."
                  : "يمكنك مسح الرسائل من عندك فقط."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          {step ? (
            <Button variant="destructive" onClick={() => onConfirm(step)} className="min-h-11 min-w-28 flex-1 sm:flex-none">
              {step === "me" ? "مسح لديّ" : "مسح لدى الجميع"}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onChoose("me")} className="min-h-11 flex-1 sm:flex-none">
                مسح لديّ
              </Button>
              {canEveryone && (
                <Button variant="outline" onClick={() => onChoose("everyone")} className="min-h-11 flex-1 sm:flex-none">
                  مسح لدى الجميع
                </Button>
              )}
            </>
          )}
          <Button variant="ghost" onClick={onClose} className="min-h-11 flex-1 sm:flex-none">
            تراجع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** `value` while `open`; the last value seen open once it closes (so a dialog's text doesn't change as it fades out) */
export function useHeldWhileClosed<T>(value: T, open: boolean): T {
  const [held, setHeld] = useState(value);
  if (open && !Object.is(held, value)) setHeld(value);
  return open ? value : held;
}

/** «حذف الرسالة؟» (selection bar): «حذف لدى الجميع» (when allowed), «حذف لديّ», «إلغاء». A choice deletes at once */
function DeleteMessageChoiceDialog({
  open,
  canEveryone,
  returnFocus,
  onChoose,
  onClose,
}: {
  open: boolean;
  canEveryone: boolean;
  returnFocus?: RefObject<HTMLElement | null>;
  onChoose: (scope: DeleteScope) => void;
  onClose: () => void;
}) {
  // While it fades out the question is gone (`canEveryone` false): keep showing what was asked
  const everyone = useHeldWhileClosed(canEveryone, open);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="text-right sm:max-w-md" onCloseAutoFocus={returnFocus ? returnFocusTo(returnFocus) : undefined}>
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="text-lg">حذف الرسالة؟</DialogTitle>
          <DialogDescription className="text-right leading-relaxed">
            {everyone ? "يمكنك حذفها من عندك فقط، أو لديك ولدى الطرف الآخر." : "ستُحذف من عندك فقط، وتبقى لدى الطرف الآخر."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          {everyone && (
            <Button variant="destructive" onClick={() => onChoose("everyone")} className="min-h-11 flex-1 sm:flex-none">
              حذف لدى الجميع
            </Button>
          )}
          <Button variant="outline" onClick={() => onChoose("me")} className="min-h-11 flex-1 sm:flex-none">
            حذف لديّ
          </Button>
          <Button variant="ghost" onClick={onClose} className="min-h-11 flex-1 sm:flex-none">
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Non-Pro: what Pro gives here, and the way to the Pro page. Nothing is sent */
export function DeleteUpsellDialog({
  text,
  onClose,
  returnFocus,
}: {
  text: string | null;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog open={!!text} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="text-right sm:max-w-md" onCloseAutoFocus={returnFocus ? returnFocusTo(returnFocus) : undefined}>
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Crown className="h-5 w-5 text-accent-ink" aria-hidden /> ميزة Pro
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed">{text}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
          <Button asChild className="min-h-11 flex-1 sm:flex-none">
            <Link href={PRO_PAGE_PATH}>عضوية Pro</Link>
          </Button>
          <Button variant="ghost" onClick={onClose} className="min-h-11 flex-1 sm:flex-none">
            ليس الآن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
