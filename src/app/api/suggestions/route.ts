import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/utils";
import { autoSuggestForUser } from "@/lib/matching/auto-suggest";

export async function GET(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const { searchParams } = new URL(request.url);
    const { page, pageSize, skip } = parsePagination(searchParams, 10);

    // Users get suggestions automatically once their profile qualifies (no admin run needed)
    if (page === 1) {
      try {
        await autoSuggestForUser(session.user.id);
      } catch (err) {
        console.error("Auto-suggest error:", err);
      }
    }

    // Get blocked user IDs (both directions)
    const blocks = await db.block.findMany({
      where: {
        OR: [
          { blockerId: session.user.id },
          { blockedId: session.user.id },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    const blockedIds = new Set(
      blocks.flatMap((b) => [b.blockerId, b.blockedId]).filter((id) => id !== session.user.id)
    );

    const where = {
      recipientId: session.user.id,
      status: "PENDING" as const,
      ...(blockedIds.size > 0 && {
        candidateId: { notIn: [...blockedIds] },
      }),
    };

    const [suggestions, total] = await Promise.all([
      db.suggestion.findMany({
        where,
        include: {
          candidate: {
            select: {
              id: true,
              firstName: true,
              isVerified: true,
              profile: {
                select: {
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
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      db.suggestion.count({ where }),
    ]);

    const formattedSuggestions = suggestions.map((s) => {
      const age = s.candidate.profile?.dateOfBirth
        ? Math.floor((Date.now() - new Date(s.candidate.profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      return {
        id: s.id,
        compatibilityScore: s.compatibilityScore,
        source: s.source,
        createdAt: s.createdAt,
        candidate: {
          id: s.candidate.id,
          firstName: s.candidate.firstName,
          isVerified: s.candidate.isVerified,
          age,
          city: s.candidate.profile?.city,
          area: s.candidate.profile?.area,
          nationality: s.candidate.profile?.nationality,
          education: s.candidate.profile?.education,
          fieldOfStudy: s.candidate.profile?.fieldOfStudy,
          job: s.candidate.profile?.job,
          incomeRange: s.candidate.profile?.incomeRange,
          height: s.candidate.profile?.height,
          weight: s.candidate.profile?.weight,
          skinColor: s.candidate.profile?.skinColor,
          maritalStatus: s.candidate.profile?.maritalStatus,
          childrenCount: s.candidate.profile?.childrenCount ?? 0,
          religiosity: s.candidate.profile?.religiosity,
          smokingStatus: s.candidate.profile?.smokingStatus,
          aboutMe: s.candidate.profile?.aboutMe,
          hobbies: s.candidate.profile?.hobbies,
          interests: s.candidate.profile?.interests,
          lifestyle: s.candidate.profile?.lifestyle,
          beard: s.candidate.profile?.beard,
          hijab: s.candidate.profile?.hijab,
          tribe: s.candidate.profile?.tribe,
          familyOriginArea: s.candidate.profile?.familyOriginArea,
          numberOfSiblings: s.candidate.profile?.numberOfSiblings,
          housingType: s.candidate.profile?.housingType,
          cookingAbility: s.candidate.profile?.cookingAbility,
          drivingLicense: s.candidate.profile?.drivingLicense,
          willingToRelocate: s.candidate.profile?.willingToRelocate,
          familyValues: s.candidate.profile?.familyValues,
        },
      };
    });

    // Remaining suggestion credits (the UI shows a recharge alert at 0)
    const me = await db.user.findUnique({ where: { id: session.user.id }, select: { matchCredits: true } });

    return NextResponse.json({
      credits: me?.matchCredits ?? 0,
      suggestions: formattedSuggestions,
      page,
      totalPages: Math.ceil(total / pageSize),
      total,
    });
  } catch (error) {
    console.error("Suggestions error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
