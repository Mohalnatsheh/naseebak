"use client";

import { Copy, Flag, MoreVertical, Reply, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { REACTION_EMOJI } from "@/lib/chat/reactions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UiMessage } from "./chat-utils";
import { copyText, type MessageActions } from "./message-menu";
import { selectionTools } from "./wa-chat-logic";

/**
 * The selected message as it is now (the room keeps only its id): null when the id is gone, the message is still
 * sending or failed, or nothing is left to do with it (e.g. my message deleted for everyone in a closed chat). The
 * partner's trace stays selectable: «إبلاغ عن الرسالة» is still possible.
 */
export function selectedMessage(messages: readonly UiMessage[], selectedId: string | null, actions: MessageActions): UiMessage | null {
  if (!selectedId) return null;
  const m = messages.find((x) => x.id === selectedId);
  if (!m || m.pending) return null;
  return Object.values(selectionTools(m, actions)).some(Boolean) ? m : null;
}

const iconButton =
  "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-primary-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60 motion-reduce:transition-none";

/**
 * The top bar while one message is selected (Android WhatsApp): ✕, «1», then reply, copy, delete and ⋮ → report, each
 * only where `selectionTools` allows it. Every action ends the selection.
 */
export function WaSelectionBar({
  message,
  actions,
  onClose,
  onDelete,
}: {
  message: UiMessage;
  actions: MessageActions;
  onClose: () => void;
  onDelete: (m: UiMessage) => void;
}) {
  const tools = selectionTools(message, actions);
  return (
    <div role="toolbar" aria-label="الرسالة المحددة" className="flex h-full min-h-14 w-full items-center gap-1 bg-primary px-1 text-primary-foreground">
      <button type="button" aria-label="إلغاء التحديد" onClick={onClose} className={iconButton}>
        <X className="size-6" aria-hidden />
      </button>
      <span className="ms-1 text-title font-semibold tabular-nums">1</span>
      <div className="ms-auto flex items-center gap-1">
        {tools.reply && (
          <button
            type="button"
            aria-label="رد"
            className={iconButton}
            onClick={() => {
              actions.onReply(message);
              onClose();
            }}
          >
            <Reply className="size-6" aria-hidden />
          </button>
        )}
        {tools.copy && (
          <button
            type="button"
            aria-label="نسخ"
            className={iconButton}
            onClick={() => {
              void copyText(message.body);
              onClose();
            }}
          >
            <Copy className="size-6" aria-hidden />
          </button>
        )}
        {tools.delete && (
          <button
            type="button"
            aria-label="حذف"
            className={iconButton}
            onClick={() => {
              onDelete(message);
              onClose();
            }}
          >
            <Trash2 className="size-6" aria-hidden />
          </button>
        )}
        {tools.report && (
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="خيارات أخرى" className={iconButton}>
                <MoreVertical className="size-6" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                variant="destructive"
                className="min-h-11"
                onSelect={() => {
                  actions.onReport(message);
                  onClose();
                }}
              >
                <Flag className="h-4 w-4" /> إبلاغ عن الرسالة
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

/** The white pill of the four reactions above the selected bubble; mine is ringed. Nothing where reacting isn't allowed */
export function WaReactionPicker({
  message,
  actions,
  onPicked,
  className,
}: {
  message: UiMessage;
  actions: MessageActions;
  onPicked: () => void;
  className?: string;
}) {
  if (!selectionTools(message, actions).react) return null;
  const myEmoji = message.reactions.find((r) => r.mine)?.emoji;
  return (
    <div role="group" aria-label="تفاعل" className={cn("inline-flex items-center gap-1 rounded-full bg-card p-1 shadow-md ring-1 ring-border/60", className)}>
      {REACTION_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`تفاعل ${emoji}`}
          aria-pressed={myEmoji === emoji}
          onClick={() => {
            actions.onReact(message, emoji);
            onPicked();
          }}
          className={cn(
            "flex size-11 items-center justify-center rounded-full text-2xl leading-none transition-transform hover:scale-110 motion-reduce:transition-none motion-reduce:hover:scale-100",
            myEmoji === emoji && "bg-primary/10 ring-2 ring-primary/40"
          )}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
