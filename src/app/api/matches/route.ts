import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
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

    const matches = await db.mutualMatch.findMany({
      where: {
        OR: [
          { femaleId: session.user.id },
          { maleId: session.user.id },
        ],
      },
      include: {
        female: {
          select: { id: true, firstName: true, profile: { select: profileSelect } },
        },
        male: {
          select: { id: true, firstName: true, profile: { select: profileSelect } },
        },
        visitRequest: {
          select: { status: true, scheduledDate: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Fetch compatibility scores from suggestions
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
        visitStatus: m.visitRequest?.status || null,
        scheduledDate: m.visitRequest?.scheduledDate || null,
        compatibilityScore: m.suggestionId ? (scoreMap.get(m.suggestionId) ?? 0) : 0,
        partner: {
          id: otherUser.id,
          firstName: otherUser.firstName,
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

    return NextResponse.json({ matches: formatted });
  } catch (error) {
    console.error("Matches error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
