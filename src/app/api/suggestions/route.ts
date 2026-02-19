import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const suggestions = await db.suggestion.findMany({
      where: {
        recipientId: session.user.id,
        status: "PENDING",
      },
      include: {
        candidate: {
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
    });

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
          firstName: s.candidate.firstName,
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

    return NextResponse.json({
      suggestions: formattedSuggestions,
    });
  } catch (error) {
    console.error("Suggestions error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
