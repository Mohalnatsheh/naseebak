import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { profileSchema } from "@/lib/validations/profile";
import { calculateCompleteness } from "@/lib/profile-completeness";
import { createNotificationIfAllowed } from "@/lib/notification-helper";
import { autoSuggestForUser } from "@/lib/matching/auto-suggest";
import { maybeAwardReferral } from "@/lib/referral";

export async function GET() {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

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
          select: { id: true, parentName: true, relationship: true, address: true, shareConsentAt: true },
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
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

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

    // Profile is filled in: start suggestions right away (fire-and-forget, never blocks the save)
    autoSuggestForUser(session.user.id).catch((err) => console.error("Auto-suggest error:", err));

    // After profile is complete, check for referral credit awarding
    await maybeAwardReferral(session.user.id);

    return NextResponse.json({ message: "تم تحديث الملف الشخصي", profile });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
