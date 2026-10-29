import { NextResponse } from "next/server";
import { localUploadsAllowed, readLocalUpload } from "@/lib/bunny";

const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Local runs only: serves the photos kept in `.dev-uploads/` when Bunny isn't configured (`src/lib/bunny.ts`).
 * 404 on any server that uses Bunny or isn't localhost.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!localUploadsAllowed()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const path = (await params).path.join("/");
  const type = TYPES[path.split(".").pop()?.toLowerCase() ?? ""];
  const file = type ? await readLocalUpload(path) : null;
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": type, "Cache-Control": "private, no-store" } });
}
