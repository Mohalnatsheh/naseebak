"use client";

import { ChevronDown, Copy, Flag, Reply } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { REACTION_EMOJI } from "@/lib/chat/reactions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UiMessage } from "./chat-utils";

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
}

/** Which items the menu has for this message (none = no menu at all) */
export function menuItemsFor(m: UiMessage, canInteract: boolean) {
  const saved = !m.pending;
  return {
    reply: saved && canInteract,
    react: saved && canInteract,
    copy: m.kind === "TEXT" && !!m.body,
    report: saved && !m.mine,
  };
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
 * The hover / long-press menu of a message: the four reactions, «رد», «نسخ» (text only), «إبلاغ عن الرسالة» (theirs).
 * No delete for everyone: what was sent stays as evidence for a report. The trigger shows on hover or keyboard focus
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
  const items = menuItemsFor(message, actions.canInteract);
  if (!items.reply && !items.react && !items.copy && !items.report) return null;
  const mine = message.mine;
  const myEmoji = message.reactions.find((r) => r.mine)?.emoji;
  return (
    <DropdownMenu dir="rtl" open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="خيارات الرسالة"
          className={cn(
            "absolute top-0.5 z-10 flex h-7 w-7 items-center justify-center rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover/bubble:opacity-100 data-[state=open]:opacity-100",
            "end-0.5 pointer-coarse:pointer-events-none",
            mine ? "bg-primary text-primary-foreground/80" : "bg-card text-muted-foreground"
          )}
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={mine ? "start" : "end"} className="w-56">
        {items.react && (
          <>
            <div role="group" aria-label="تفاعل" className="flex items-center justify-between gap-1 px-1 py-1">
              {REACTION_EMOJI.map((emoji) => (
                <DropdownMenuItem
                  key={emoji}
                  onSelect={() => actions.onReact(message, emoji)}
                  aria-label={`تفاعل ${emoji}`}
                  aria-pressed={myEmoji === emoji}
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
          <DropdownMenuItem onSelect={() => actions.onReply(message)} className="min-h-11">
            <Reply className="h-4 w-4" /> رد
          </DropdownMenuItem>
        )}
        {items.copy && (
          <DropdownMenuItem onSelect={() => void copyText(message.body)} className="min-h-11">
            <Copy className="h-4 w-4" /> نسخ
          </DropdownMenuItem>
        )}
        {items.report && (
          <DropdownMenuItem variant="destructive" onSelect={() => actions.onReport(message)} className="min-h-11">
            <Flag className="h-4 w-4" /> إبلاغ عن الرسالة
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
