import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { MATCHES_ORDER, pageForMatch, visibleMatchesWhere } from "@/lib/matches/focus";
import { hiddenPartnerIds, loadMatchStates } from "@/lib/matches/state";
import { getCycleFlags } from "@/lib/settings";

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const pagination = parsePagination(searchParams, 10);
    const { pageSize } = pagination;
    let { page, skip } = pagination;
    // A partner who blocked me: the match disappears from my list (and from ?focus links)
    const hidden = await hiddenPartnerIds(session.user.id);
    // ?focus=<matchId>: return the page that holds that match (links from notifications / dashboard)
    const focus = searchParams.get("focus");
    if (focus) {
      const focusPage = await pageForMatch(session.user.id, focus, pageSize, hidden);
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

    const where = visibleMatchesWhere(session.user.id, hidden);

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

    // Closed matches (I blocked them / their account is inactive / nothing left to do)
    const states = await loadMatchStates(session.user.id, await getCycleFlags(), matches.map((m) => m.id));

    const formatted = matches.map((m) => {
      const otherUser = m.femaleId === session.user.id ? m.male : m.female;
      const profile = otherUser.profile;

      const age = profile?.dateOfBirth
        ? Math.floor((Date.now() - new Date(profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      const state = states.get(m.id);
      const closed = state?.closed ?? null;
      // Blocked, inactive or ended («لم يحصل نصيب»): a closed card — no photos, no full profile, no actions
      const locked = closed === "blocked" || closed === "inactive" || closed === "ended";
      /** Locked cards keep only who it was (name, age, city) */
      const detail = <T>(value: T): T | null => (locked ? null : value);

      return {
        id: m.id,
        closed,
        blockId: closed === "blocked" ? state?.blockId ?? null : null,
        photosRevealed: locked ? false : m.photosRevealed,
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
          area: detail(profile?.area ?? null),
          nationality: detail(profile?.nationality ?? null),
          education: detail(profile?.education ?? null),
          fieldOfStudy: detail(profile?.fieldOfStudy ?? null),
          job: detail(profile?.job ?? null),
          incomeRange: detail(profile?.incomeRange ?? null),
          height: detail(profile?.height ?? null),
          weight: detail(profile?.weight ?? null),
          skinColor: detail(profile?.skinColor ?? null),
          maritalStatus: detail(profile?.maritalStatus ?? null),
          childrenCount: locked ? 0 : (profile?.childrenCount ?? 0),
          religiosity: detail(profile?.religiosity ?? null),
          smokingStatus: detail(profile?.smokingStatus ?? null),
          aboutMe: detail(profile?.aboutMe ?? null),
          hobbies: detail(profile?.hobbies ?? null),
          interests: detail(profile?.interests ?? null),
          lifestyle: detail(profile?.lifestyle ?? null),
          beard: detail(profile?.beard ?? null),
          hijab: detail(profile?.hijab ?? null),
          tribe: detail(profile?.tribe ?? null),
          familyOriginArea: detail(profile?.familyOriginArea ?? null),
          numberOfSiblings: detail(profile?.numberOfSiblings ?? null),
          housingType: detail(profile?.housingType ?? null),
          cookingAbility: detail(profile?.cookingAbility ?? null),
          drivingLicense: detail(profile?.drivingLicense ?? null),
          willingToRelocate: detail(profile?.willingToRelocate ?? null),
          familyValues: detail(profile?.familyValues ?? null),
        },
      };
    });

    return NextResponse.json({ matches: formatted, page, totalPages: Math.ceil(total / pageSize), total });
  } catch (error) {
    console.error("Matches error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
