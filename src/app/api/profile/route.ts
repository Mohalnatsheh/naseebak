import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { profileSchema } from "@/lib/validations/profile";
import { calculateCompleteness } from "@/lib/profile-completeness";
import { createNotificationIfAllowed } from "@/lib/notification-helper";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        gender: true,
        status: true,
        isVerified: true,
        isDeactivated: true,
        matchCredits: true,
        createdAt: true,
        profile: true,
        personalityResult: {
          select: { personalityType: true, createdAt: true, updatedAt: true },
        },
        parentInfo: {
          select: { id: true, parentName: true, relationship: true, address: true },
        },
        identityDoc: {
          select: { status: true },
        },
        photos: {
          select: { id: true, url: true, order: true, isPrimary: true },
          orderBy: { order: "asc" },
        },
        _count: {
          select: {
            receivedSuggestions: true,
            matchesAsFemale: true,
            matchesAsMale: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    const completeness = calculateCompleteness(user);

    return NextResponse.json({ user, completeness });
  } catch (error) {
    console.error("Profile get error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const body = await request.json();

    const validation = profileSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message || "بيانات غير صالحة";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const {
      dateOfBirth, city, nationality, education, fieldOfStudy, job, incomeRange,
      height, weight, skinColor, childrenCount, willingToRelocate, maritalStatus, religiosity,
      familyValues, partnerExpectations, hobbies, interests, lifestyle,
      hijab, smokingStatus, aboutMe,
      area, latitude, longitude, tribe, familyOriginArea, numberOfSiblings, housingType,
      beard, cookingAbility, drivingLicense, healthConditions, monthlyExpenses, wantsPhoto,
      prefAgeMin, prefAgeMax, prefCity, prefEducation, prefMaritalStatus,
      prefHijab, prefBeard, prefReligiosity, prefSmokingStatus, prefChildrenAcceptance,
    } = body;

    const profile = await db.profile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        city, nationality, education, fieldOfStudy, job, incomeRange,
        height: height ? parseInt(height) : null,
        weight: weight ? parseInt(weight) : null,
        skinColor, childrenCount: childrenCount != null ? parseInt(childrenCount) : 0,
        willingToRelocate, maritalStatus, religiosity,
        familyValues, partnerExpectations, hobbies, interests, lifestyle,
        hijab, smokingStatus, aboutMe,
        area,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        tribe, familyOriginArea,
        numberOfSiblings: numberOfSiblings != null ? parseInt(numberOfSiblings) : null,
        housingType,
        beard: beard ?? null,
        cookingAbility, drivingLicense: drivingLicense ?? null,
        healthConditions, monthlyExpenses,
        wantsPhoto: wantsPhoto ?? null,
        prefAgeMin: prefAgeMin != null ? parseInt(prefAgeMin) : null,
        prefAgeMax: prefAgeMax != null ? parseInt(prefAgeMax) : null,
        prefCity: Array.isArray(prefCity) ? prefCity : [],
        prefEducation: Array.isArray(prefEducation) ? prefEducation : [],
        prefMaritalStatus: Array.isArray(prefMaritalStatus) ? prefMaritalStatus : [],
        prefHijab: prefHijab ?? null,
        prefBeard: prefBeard ?? null,
        prefReligiosity: Array.isArray(prefReligiosity) ? prefReligiosity : [],
        prefSmokingStatus: Array.isArray(prefSmokingStatus) ? prefSmokingStatus : [],
        prefChildrenAcceptance: prefChildrenAcceptance ?? null,
        isComplete: true,
      },
      update: {
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        city, nationality, education, fieldOfStudy, job, incomeRange,
        height: height ? parseInt(height) : undefined,
        weight: weight ? parseInt(weight) : undefined,
        skinColor, childrenCount: childrenCount != null ? parseInt(childrenCount) : undefined,
        willingToRelocate, maritalStatus, religiosity,
        familyValues, partnerExpectations, hobbies, interests, lifestyle,
        hijab, smokingStatus, aboutMe,
        area,
        latitude: latitude ? parseFloat(latitude) : undefined,
        longitude: longitude ? parseFloat(longitude) : undefined,
        tribe, familyOriginArea,
        numberOfSiblings: numberOfSiblings != null ? parseInt(numberOfSiblings) : undefined,
        housingType,
        beard: beard ?? undefined,
        cookingAbility, drivingLicense: drivingLicense ?? undefined,
        healthConditions, monthlyExpenses,
        wantsPhoto: wantsPhoto ?? undefined,
        prefAgeMin: prefAgeMin != null ? parseInt(prefAgeMin) : undefined,
        prefAgeMax: prefAgeMax != null ? parseInt(prefAgeMax) : undefined,
        prefCity: Array.isArray(prefCity) ? prefCity : undefined,
        prefEducation: Array.isArray(prefEducation) ? prefEducation : undefined,
        prefMaritalStatus: Array.isArray(prefMaritalStatus) ? prefMaritalStatus : undefined,
        prefHijab: prefHijab ?? undefined,
        prefBeard: prefBeard ?? undefined,
        prefReligiosity: Array.isArray(prefReligiosity) ? prefReligiosity : undefined,
        prefSmokingStatus: Array.isArray(prefSmokingStatus) ? prefSmokingStatus : undefined,
        prefChildrenAcceptance: prefChildrenAcceptance ?? undefined,
        isComplete: true,
      },
    });

    // After profile is complete, check for referral credit awarding
    try {
      // Re-fetch full user data to calculate completeness
      const fullUser = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
          identityDoc: { select: { status: true } },
          profile: true,
          personalityResult: { select: { personalityType: true } },
          photos: { select: { id: true } },
          parentInfo: { select: { id: true, parentName: true } },
        },
      });

      if (fullUser) {
        const completeness = calculateCompleteness(fullUser);

        if (completeness.total === 100) {
          // Check for un-awarded referral
          const referral = await db.referral.findUnique({
            where: { refereeId: session.user.id },
            select: { id: true, referrerId: true, creditsAwarded: true },
          });

          if (referral && !referral.creditsAwarded) {
            await db.$transaction([
              // Award referee +1 credit
              db.user.update({
                where: { id: session.user.id },
                data: { matchCredits: { increment: 1 } },
              }),
              // Award referrer +2 credits
              db.user.update({
                where: { id: referral.referrerId },
                data: { matchCredits: { increment: 2 } },
              }),
              // Mark referral as awarded
              db.referral.update({
                where: { id: referral.id },
                data: { creditsAwarded: true, awardedAt: new Date() },
              }),
            ]);

            // Notify both users
            await Promise.all([
              createNotificationIfAllowed(
                session.user.id,
                "SYSTEM",
                "مكافأة الإحالة",
                "تهانينا! حصلت على رصيد إضافي (+1) كمكافأة إحالة لاكتمال ملفك الشخصي",
                undefined,
                "https://naseebak.com/dashboard/payments",
              ),
              createNotificationIfAllowed(
                referral.referrerId,
                "SYSTEM",
                "مكافأة الإحالة",
                "تهانينا! حصلت على رصيد إضافي (+2) لأن شخصاً أحلته أكمل ملفه الشخصي",
                undefined,
                "https://naseebak.com/dashboard/payments",
              ),
            ]);
          }
        }
      }
    } catch (referralError) {
      // Don't fail the profile update if referral awarding fails
      console.error("Referral credit awarding error:", referralError);
    }

    return NextResponse.json({ message: "تم تحديث الملف الشخصي", profile });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
