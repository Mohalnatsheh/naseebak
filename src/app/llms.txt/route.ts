import { db } from "@/lib/db";
import { activeCountryCodes } from "@/lib/countries/settings";
import { buildLlmsText } from "@/lib/seo";

/** naseebak.com/llms.txt: always the open countries and published posts */
export const dynamic = "force-dynamic";

export async function GET() {
  const countries = await activeCountryCodes();
  const posts = await db.blogPost.findMany({
    where: { status: "PUBLISHED", country: { in: countries } },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, excerpt: true, country: true },
  });
  return new Response(buildLlmsText({ countries, posts }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
