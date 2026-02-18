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
        femaleId: session.user.id,
        status: "PENDING",
      },
      include: {
        male: {
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
      const age = s.male.profile?.dateOfBirth
        ? Math.floor((Date.now() - new Date(s.male.profile.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      return {
        id: s.id,
        compatibilityScore: s.compatibilityScore,
        source: s.source,
        createdAt: s.createdAt,
        candidate: {
          firstName: s.male.firstName,
          age,
          city: s.male.profile?.city,
          area: s.male.profile?.area,
          nationality: s.male.profile?.nationality,
          education: s.male.profile?.education,
          fieldOfStudy: s.male.profile?.fieldOfStudy,
          job: s.male.profile?.job,
          incomeRange: s.male.profile?.incomeRange,
          height: s.male.profile?.height,
          weight: s.male.profile?.weight,
          skinColor: s.male.profile?.skinColor,
          maritalStatus: s.male.profile?.maritalStatus,
          childrenCount: s.male.profile?.childrenCount ?? 0,
          religiosity: s.male.profile?.religiosity,
          smokingStatus: s.male.profile?.smokingStatus,
          aboutMe: s.male.profile?.aboutMe,
          hobbies: s.male.profile?.hobbies,
          interests: s.male.profile?.interests,
          lifestyle: s.male.profile?.lifestyle,
          beard: s.male.profile?.beard,
          tribe: s.male.profile?.tribe,
          familyOriginArea: s.male.profile?.familyOriginArea,
          numberOfSiblings: s.male.profile?.numberOfSiblings,
          housingType: s.male.profile?.housingType,
          cookingAbility: s.male.profile?.cookingAbility,
          drivingLicense: s.male.profile?.drivingLicense,
          willingToRelocate: s.male.profile?.willingToRelocate,
          familyValues: s.male.profile?.familyValues,
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
