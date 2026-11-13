"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { endedChatNote } from "./chat-look";
import type { ChatRoomModel, ChatRoomReady } from "./use-chat-room";

/**
 * The read-only bar that replaces the composer when the chat can't be written to (WhatsApp's "You can't send messages"
 * bar): today's texts, family links and the free move to family, in a full-width card bar.
 */
export function WaReadOnlyFooter({ model, ready }: { model: ChatRoomModel; ready: ChatRoomReady }) {
  const { intro, family, familyFree, familyOpenUntil, setFamilyDialog } = model;
  const { conversation, closedFamily } = ready;
  const familyOffered = conversation.status === "EXPIRED" && !conversation.blocked && family?.status === "none" && intro?.flags.introRequests && !intro.closed;
  return (
    <div
      data-testid="chat-read-only"
      className="w-full border-t border-border/60 bg-card px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm text-muted-foreground"
    >
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
      {familyOffered && (
        <div className="mt-2">
          <Button size="sm" onClick={() => setFamilyDialog(true)} className="min-h-11 gap-1.5">
            <Users className="h-4 w-4" aria-hidden="true" /> ننتقل لتعارف عائلي
          </Button>
        </div>
      )}
    </div>
  );
}
