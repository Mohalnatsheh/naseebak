"use client";

import { useRef } from "react";
import { ChevronDown, Copy, Flag, Lock, Reply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { REACTION_EMOJI } from "@/lib/chat/reactions";
import type { DeleteScope } from "@/lib/chat/visibility";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UiMessage } from "./chat-utils";
import { useRowTabIndex } from "./row-focus";

/** What a member can do with one message (the room decides what the chat allows) */
export interface MessageActions {
  /** Open, unblocked chat: reply and reactions */
  canInteract: boolean;
  onReply: (m: UiMessage) => void;
  onReact: (m: UiMessage, emoji: string) => void;
  /** «إبلاغ عن الرسالة» (the other person's messages): the report flow with this message prefilled */
  onReport: (m: UiMessage) => void;
  /** Tapping a quote: scroll to the original */
  onOpenQuote: (id: string) => void;
  /** Tapping a photo: the full-screen viewer */
  onOpenPhoto: (id: string) => void;
  /** Chat delete: "use" (Pro), "upsell" (could buy Pro: the same entries open the offer), null/absent: no entries */
  deleteMode?: "use" | "upsell" | null;
  /** «حذف لدى الجميع» (my own messages): only in a chat I can still write in */
  canDeleteForEveryone?: boolean;
  onDelete?: (m: UiMessage, scope: DeleteScope) => void;
}

/**
 * Which items the menu has for this message (none = no menu at all). A trace (deleted for everyone) keeps only
 * «إبلاغ عن الرسالة» (theirs: the report stays possible) and «حذف لديّ».
 */
export function menuItemsFor(
  m: UiMessage,
  canInteract: boolean,
  del: { mode?: "use" | "upsell" | null; forEveryone?: boolean } = {}
) {
  const saved = !m.pending;
  const live = !m.deleted;
  const deletable = saved && !!del.mode;
  return {
    reply: saved && live && canInteract,
    react: saved && live && canInteract,
    copy: live && m.kind === "TEXT" && !!m.body,
    report: saved && !m.mine,
    deleteMe: deletable,
    deleteEveryone: deletable && live && m.mine && !!del.forEveryone,
  };
}

/** The menu items of a message as the room's actions allow them */
export function menuItemsForActions(m: UiMessage, a: MessageActions) {
  return menuItemsFor(m, a.canInteract, { mode: a.onDelete ? a.deleteMode : null, forEveryone: a.canDeleteForEveryone });
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("تم النسخ");
  } catch {
    toast.error("تعذّر النسخ");
  }
}

/**
 * The hover / long-press menu of a message: the four reactions, «رد», «نسخ» (text only), «إبلاغ عن الرسالة» (theirs),
 * and for Pro «حذف لديّ» / «حذف لدى الجميع» (mine only; nothing is erased: reports and admins keep the original). The trigger shows on hover or keyboard focus
 * (desktop); on phones a long press opens it (the bubble controls `open`).
 */
export function MessageMenu({
  message,
  actions,
  open,
  onOpenChange,
}: {
  message: UiMessage;
  actions: MessageActions;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const items = menuItemsForActions(message, actions);
  const rowTab = useRowTabIndex();
  // «رد» / «إبلاغ» move the focus on (the composer, the dialog): the menu doesn't pull it back to its button (PA-L7)
  const movesFocus = useRef(false);
  if (!Object.values(items).some(Boolean)) return null;
  const upsell = actions.deleteMode === "upsell";
  const mine = message.mine;
  const myEmoji = message.reactions.find((r) => r.mine)?.emoji;
  return (
    <DropdownMenu dir="rtl" open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          tabIndex={rowTab}
          aria-label="خيارات الرسالة"
          className={cn(
            "absolute top-0 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border/60 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/bubble:opacity-100 data-[state=open]:opacity-100",
            // Beside the bubble, on its free side, never over the time on a short message (QA WC2-14)
            mine ? "-end-8" : "-start-8",
            "pointer-coarse:pointer-events-none"
          )}
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={mine ? "start" : "end"}
        className="w-56"
        onCloseAutoFocus={(e) => {
          if (!movesFocus.current) return;
          movesFocus.current = false;
          e.preventDefault();
        }}
      >
        {items.react && (
          <>
            <div
              role="group"
              aria-label="تفاعل"
              className="flex items-center justify-between gap-1 px-1 py-1"
              // The emoji row is a row: ← / → move along it too (RTL: ← is the next one), not only ↑ / ↓ (PA-L7)
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                const all = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]"));
                const i = all.indexOf(document.activeElement as HTMLElement);
                if (i < 0) return;
                const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
                const step = (e.key === "ArrowLeft") === rtl ? 1 : -1;
                e.preventDefault();
                e.stopPropagation();
                all[(i + step + all.length) % all.length]?.focus();
              }}
            >
              {REACTION_EMOJI.map((emoji) => (
                <DropdownMenuItem
                  key={emoji}
                  onSelect={() => actions.onReact(message, emoji)}
                  // The state is in the name: aria-pressed isn't valid on a menuitem
                  aria-label={myEmoji === emoji ? `تفاعل ${emoji} · تفاعلك` : `تفاعل ${emoji}`}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full p-0 text-2xl leading-none",
                    myEmoji === emoji && "bg-primary/10 ring-1 ring-primary/30"
                  )}
                >
                  {emoji}
                </DropdownMenuItem>
              ))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {items.reply && (
          <DropdownMenuItem
            onSelect={() => {
              movesFocus.current = true;
              actions.onReply(message);
            }}
            className="min-h-11"
          >
            <Reply className="h-4 w-4" /> رد
          </DropdownMenuItem>
        )}
        {items.copy && (
          <DropdownMenuItem onSelect={() => void copyText(message.body)} className="min-h-11">
            <Copy className="h-4 w-4" /> نسخ
          </DropdownMenuItem>
        )}
        {items.deleteMe && (
          <DropdownMenuItem
            onSelect={() => {
              movesFocus.current = true;
              actions.onDelete?.(message, "me");
            }}
            className="min-h-11"
          >
            <Trash2 className="h-4 w-4" /> حذف لديّ
            {upsell && <Lock className="ms-auto h-3.5 w-3.5 text-muted-foreground" aria-label="ميزة Pro" />}
          </DropdownMenuItem>
        )}
        {items.deleteEveryone && (
          <DropdownMenuItem
            onSelect={() => {
              movesFocus.current = true;
              actions.onDelete?.(message, "everyone");
            }}
            className="min-h-11"
          >
            <Trash2 className="h-4 w-4" /> حذف لدى الجميع
            {upsell && <Lock className="ms-auto h-3.5 w-3.5 text-muted-foreground" aria-label="ميزة Pro" />}
          </DropdownMenuItem>
        )}
        {items.report && (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              movesFocus.current = true;
              actions.onReport(message);
            }}
            className="min-h-11"
          >
            <Flag className="h-4 w-4" /> إبلاغ عن الرسالة
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
