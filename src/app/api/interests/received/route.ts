import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    // Find all likes directed at this user
    const likes = await db.like.findMany({
      where: {
        toUserId: session.user.id,
        isLiked: true,
      },
      include: {
        fromUser: {
          select: {
            id: true,
            firstName: true,
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
                hijab: true,
                beard: true,
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
    });

    // Fetch compatibility scores from Suggestion table
    const suggestionIds = likes
      .map((l) => l.suggestionId)
      .filter((id): id is string => !!id);
    const suggestions = suggestionIds.length
      ? await db.suggestion.findMany({
          where: { id: { in: suggestionIds } },
          select: { id: true, compatibilityScore: true },
        })
      : [];
    const scoreMap = new Map(suggestions.map((s) => [s.id, s.compatibilityScore]));

    // Check which ones the male has already responded to
    const maleResponses = await db.like.findMany({
      where: {
        fromUserId: session.user.id,
        toUserId: { in: likes.map((l) => l.fromUserId) },
      },
      select: { toUserId: true },
    });
    const respondedSet = new Set(maleResponses.map((r) => r.toUserId));

    const interests = likes
      .filter((l) => !respondedSet.has(l.fromUserId))
      .map((l) => {
        const age = l.fromUser.profile?.dateOfBirth
          ? Math.floor(
              (Date.now() - new Date(l.fromUser.profile.dateOfBirth).getTime()) /
                (365.25 * 24 * 60 * 60 * 1000)
            )
          : null;

        return {
          id: l.id,
          suggestionId: l.suggestionId,
          compatibilityScore: (l.suggestionId ? scoreMap.get(l.suggestionId) : null) ?? 0,
          receivedAt: l.createdAt,
          candidate: {
            firstName: l.fromUser.firstName,
            age,
            city: l.fromUser.profile?.city,
            area: l.fromUser.profile?.area,
            nationality: l.fromUser.profile?.nationality,
            education: l.fromUser.profile?.education,
            fieldOfStudy: l.fromUser.profile?.fieldOfStudy,
            job: l.fromUser.profile?.job,
            incomeRange: l.fromUser.profile?.incomeRange,
            height: l.fromUser.profile?.height,
            weight: l.fromUser.profile?.weight,
            skinColor: l.fromUser.profile?.skinColor,
            maritalStatus: l.fromUser.profile?.maritalStatus,
            childrenCount: l.fromUser.profile?.childrenCount ?? 0,
            religiosity: l.fromUser.profile?.religiosity,
            smokingStatus: l.fromUser.profile?.smokingStatus,
            aboutMe: l.fromUser.profile?.aboutMe,
            hobbies: l.fromUser.profile?.hobbies,
            interests: l.fromUser.profile?.interests,
            lifestyle: l.fromUser.profile?.lifestyle,
            hijab: l.fromUser.profile?.hijab,
            beard: l.fromUser.profile?.beard,
            tribe: l.fromUser.profile?.tribe,
            familyOriginArea: l.fromUser.profile?.familyOriginArea,
            numberOfSiblings: l.fromUser.profile?.numberOfSiblings,
            housingType: l.fromUser.profile?.housingType,
            cookingAbility: l.fromUser.profile?.cookingAbility,
            drivingLicense: l.fromUser.profile?.drivingLicense,
            willingToRelocate: l.fromUser.profile?.willingToRelocate,
            familyValues: l.fromUser.profile?.familyValues,
          },
        };
      });

    return NextResponse.json({ interests });
  } catch (error) {
    console.error("Received interests error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
