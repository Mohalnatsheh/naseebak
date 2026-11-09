"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

/** `session`: the server's session for this page, so the client doesn't fetch it again on load (QA WA-10) */
export function Providers({ children, session }: { children: React.ReactNode; session?: Session | null }) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
