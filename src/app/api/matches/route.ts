import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { MATCHES_ORDER, myMatchesWhere, pageForMatch } from "@/lib/matches/focus";

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const pagination = parsePagination(searchParams, 10);
    const { pageSize } = pagination;
    let { page, skip } = pagination;
    // ?focus=<matchId>: return the page that holds that match (links from notifications / dashboard)
    const focus = searchParams.get("focus");
    if (focus) {
      const focusPage = await pageForMatch(session.user.id, focus, pageSize);
      if (focusPage) {
        page = focusPage;
        skip = (focusPage - 1) * pageSize;
      }
    }

    const profileSelect = {
      dateOfBirth: true,
      city: true,
      area: true,
      nationality: true,
      education: true,
      fieldOfStudy: true,
      job: true,
      incomeRange: true,
      height: true,
      weight: true,
      skinColor: true,
      maritalStatus: true,
      childrenCount: true,
      religiosity: true,
      smokingStatus: true,
      aboutMe: true,
      hobbies: true,
      interests: true,
      lifestyle: true,
      beard: true,
      hijab: true,
      tribe: true,
      familyOriginArea: true,
      numberOfSiblings: true,
      housingType: true,
      cookingAbility: true,
      drivingLicense: true,
      willingToRelocate: true,
      familyValues: true,
    } as const;

    const where = myMatchesWhere(session.user.id);

    const [matches, total] = await Promise.all([
      db.mutualMatch.findMany({
        where,
        include: {
          female: {
            select: { id: true, firstName: true, isVerified: true, profile: { select: profileSelect } },
          },
          male: {
            select: { id: true, firstName: true, isVerified: true, profile: { select: profileSelect } },
          },
          visitRequest: {
            select: { id: true, status: true, scheduledDate: true },
          },
        },
        orderBy: MATCHES_ORDER,
        skip,
        take: pageSize,
      }),
      db.mutualMatch.count({ where }),
    ]);

    // Fetch compatibility scores from page items
    const suggestionIds = matches
      .map((m) => m.suggestionId)
      .filter((id): id is string => id !== null);

    const suggestions = suggestionIds.length > 0
      ? await db.suggestion.findMany({
          where: { id: { in: suggestionIds } },
          select: { id: true, compatibilityScore: true },
        })
      : [];

    const scoreMap = new Map(suggestions.map((s) => [s.id, s.compatibilityScore]));

    const formatted = matches.map((m) => {
      const otherUser = m.femaleId === session.user.id ? m.male : m.female;
      const profile = otherUser.profile;

      const age = profile?.dateOfBirth
        ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      return {
        id: m.id,
        photosRevealed: m.photosRevealed,
        revealed: true,
        createdAt: m.createdAt,
        visitRequestId: m.visitRequest?.id || null,
        visitStatus: m.visitRequest?.status || null,
        scheduledDate: m.visitRequest?.scheduledDate || null,
        compatibilityScore: m.suggestionId ? (scoreMap.get(m.suggestionId) ?? 0) : 0,
        partner: {
          id: otherUser.id,
          firstName: otherUser.firstName,
          isVerified: otherUser.isVerified,
          age,
          city: profile?.city ?? null,
          area: profile?.area ?? null,
          nationality: profile?.nationality ?? null,
          education: profile?.education ?? null,
          fieldOfStudy: profile?.fieldOfStudy ?? null,
          job: profile?.job ?? null,
          incomeRange: profile?.incomeRange ?? null,
          height: profile?.height ?? null,
          weight: profile?.weight ?? null,
          skinColor: profile?.skinColor ?? null,
          maritalStatus: profile?.maritalStatus ?? null,
          childrenCount: profile?.childrenCount ?? 0,
          religiosity: profile?.religiosity ?? null,
          smokingStatus: profile?.smokingStatus ?? null,
          aboutMe: profile?.aboutMe ?? null,
          hobbies: profile?.hobbies ?? null,
          interests: profile?.interests ?? null,
          lifestyle: profile?.lifestyle ?? null,
          beard: profile?.beard ?? null,
          hijab: profile?.hijab ?? null,
          tribe: profile?.tribe ?? null,
          familyOriginArea: profile?.familyOriginArea ?? null,
          numberOfSiblings: profile?.numberOfSiblings ?? null,
          housingType: profile?.housingType ?? null,
          cookingAbility: profile?.cookingAbility ?? null,
          drivingLicense: profile?.drivingLicense ?? null,
          willingToRelocate: profile?.willingToRelocate ?? null,
          familyValues: profile?.familyValues ?? null,
        },
      };
    });

    return NextResponse.json({ matches: formatted, page, totalPages: Math.ceil(total / pageSize), total });
  } catch (error) {
    console.error("Matches error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
