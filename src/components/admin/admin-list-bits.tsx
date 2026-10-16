"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Small shared pieces for the admin list pages (matches, chats). */

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  status?: string;
}

export function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
}

export function PersonLink({ p, hash }: { p: PersonRef; hash?: string }) {
  return (
    <Link href={`/admin/users/${p.id}${hash ?? ""}`} className="font-medium text-primary hover:underline">
      {p.firstName} {p.lastName}
      {p.status === "SUSPENDED" && <span className="ms-1 text-xs font-normal text-destructive">(suspended)</span>}
    </Link>
  );
}

export const STATE_STYLE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-destructive/10 text-destructive",
  ENDED: "bg-muted text-muted-foreground",
  EXPIRED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function StateBadge({ value, label }: { value: string; label?: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", STATE_STYLE[value] ?? "bg-muted text-muted-foreground")}>
      {label ?? value.charAt(0) + value.slice(1).toLowerCase()}
    </span>
  );
}

export function SearchBox({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <form
      className="flex max-w-md gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Filter by name or phone" />
      <Button type="submit" variant="outline" size="icon" aria-label="Search">
        <Search className="h-4 w-4" />
      </Button>
    </form>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4" /> Previous
      </Button>
      <span className="text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
