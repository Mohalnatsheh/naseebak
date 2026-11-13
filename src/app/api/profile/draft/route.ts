import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { profileDraftSchema } from "@/lib/validations/profile";
import { needsReviewBody, reviewedChanges } from "@/lib/profile-review";
import { arabicIssueMessage } from "@/lib/validations/issue-message";
import { applyNiqabRule } from "@/lib/profile-veil";
import { stripSectUnlessLebanon } from "@/lib/profile-sect";
import { getReligionEnabled } from "@/lib/settings";
import {
  RELIGION_CHRISTIAN, neededMuslimOnlyClears, religionOf, stripMuslimOnlyForChristian, stripReligionUnlessEnabled,
} from "@/lib/profile-religion";

export async function PATCH(request: Request) {
  try {
    const result = await requireUser();
    if ("error" in result) return result.error;
    const { session } = result;

    const raw = await request.json();
    const [member, existing, religionEnabled] = await Promise.all([
      db.user.findUnique({ where: { id: session.user.id }, select: { country: true } }),
      db.profile.findUnique({ where: { userId: session.user.id } }),
      getReligionEnabled(),
    ]);
    // «المذهب» is a Lebanese field: other countries never store it or its preference. «الديانة» is
    // dropped while its switch is off. A Christian (this save's religion, else the stored one) never
    // stores the Muslim-only answers.
    const religionBody = stripReligionUnlessEnabled(religionEnabled, stripSectUnlessLebanon(member?.country, raw));
    const effectiveReligion = (religionBody as Record<string, unknown> | null)?.religion ?? existing?.religion;
    const body = stripMuslimOnlyForChristian(effectiveReligion as string | null | undefined, religionBody);

    const validation = profileDraftSchema.safeParse(body);
    if (!validation.success) {
      const firstError = arabicIssueMessage(validation.error.issues[0]);
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const data = validation.data;

    // Build update object, filtering out undefined values
    const updateData: Record<string, unknown> = {};

    if (data.setupStep !== undefined) updateData.setupStep = data.setupStep;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.city !== undefined) updateData.city = data.city || null;
    if (data.nationality !== undefined) updateData.nationality = data.nationality || null;
    if (data.education !== undefined) updateData.education = data.education || null;
    if (data.fieldOfStudy !== undefined) updateData.fieldOfStudy = data.fieldOfStudy || null;
    if (data.job !== undefined) updateData.job = data.job || null;
    if (data.incomeRange !== undefined) updateData.incomeRange = data.incomeRange || null;
    if (data.height !== undefined) updateData.height = data.height;
    if (data.weight !== undefined) updateData.weight = data.weight;
    if (data.skinColor !== undefined) updateData.skinColor = data.skinColor || null;
    if (data.childrenCount !== undefined) updateData.childrenCount = data.childrenCount;
    if (data.willingToRelocate !== undefined) updateData.willingToRelocate = data.willingToRelocate || null;
    if (data.maritalStatus !== undefined) updateData.maritalStatus = data.maritalStatus || null;
    if (data.religiosity !== undefined) updateData.religiosity = data.religiosity || null;
    if (data.familyValues !== undefined) updateData.familyValues = data.familyValues || null;
    if (data.partnerExpectations !== undefined) updateData.partnerExpectations = data.partnerExpectations || null;
    if (data.hobbies !== undefined) updateData.hobbies = data.hobbies || null;
    if (data.interests !== undefined) updateData.interests = data.interests || null;
    if (data.lifestyle !== undefined) updateData.lifestyle = data.lifestyle || null;
    if (data.hijab !== undefined) updateData.hijab = data.hijab;
    if (data.niqab !== undefined) updateData.niqab = data.niqab;
    // niqab ⇒ hijab; hijab false ⇒ no niqab; leaving niqab out never clears it
    Object.assign(updateData, applyNiqabRule({ hijab: updateData.hijab, niqab: updateData.niqab }));
    if (updateData.hijab === undefined) delete updateData.hijab;
    if (updateData.niqab === undefined) delete updateData.niqab;
    if (data.smokingStatus !== undefined) updateData.smokingStatus = data.smokingStatus || null;
    if (data.sect !== undefined) updateData.sect = data.sect || null;
    if (data.aboutMe !== undefined) updateData.aboutMe = data.aboutMe || null;
    if (data.area !== undefined) updateData.area = data.area || null;
    if (data.latitude !== undefined) updateData.latitude = data.latitude;
    if (data.longitude !== undefined) updateData.longitude = data.longitude;
    if (data.tribe !== undefined) updateData.tribe = data.tribe || null;
    if (data.familyOriginArea !== undefined) updateData.familyOriginArea = data.familyOriginArea || null;
    if (data.numberOfSiblings !== undefined) updateData.numberOfSiblings = data.numberOfSiblings;
    if (data.housingType !== undefined) updateData.housingType = data.housingType || null;
    if (data.beard !== undefined) updateData.beard = data.beard;
    if (data.cookingAbility !== undefined) updateData.cookingAbility = data.cookingAbility || null;
    if (data.drivingLicense !== undefined) updateData.drivingLicense = data.drivingLicense;
    if (data.healthConditions !== undefined) updateData.healthConditions = data.healthConditions || null;
    if (data.monthlyExpenses !== undefined) updateData.monthlyExpenses = data.monthlyExpenses || null;
    if (data.wantsPhoto !== undefined) updateData.wantsPhoto = data.wantsPhoto;
    if (data.prefAgeMin !== undefined) updateData.prefAgeMin = data.prefAgeMin;
    if (data.prefAgeMax !== undefined) updateData.prefAgeMax = data.prefAgeMax;
    if (data.prefCity !== undefined) updateData.prefCity = data.prefCity;
    if (data.prefEducation !== undefined) updateData.prefEducation = data.prefEducation;
    if (data.prefMaritalStatus !== undefined) updateData.prefMaritalStatus = data.prefMaritalStatus;
    if (data.prefHijab !== undefined) updateData.prefHijab = data.prefHijab || null;
    if (data.prefBeard !== undefined) updateData.prefBeard = data.prefBeard || null;
    if (data.prefReligiosity !== undefined) updateData.prefReligiosity = data.prefReligiosity;
    if (data.prefSmokingStatus !== undefined) updateData.prefSmokingStatus = data.prefSmokingStatus;
    if (data.prefSect !== undefined) updateData.prefSect = data.prefSect;
    if (data.prefChildrenAcceptance !== undefined) updateData.prefChildrenAcceptance = data.prefChildrenAcceptance || null;
    if (data.religion !== undefined) updateData.religion = data.religion;
    if (data.prefReligion !== undefined) updateData.prefReligion = data.prefReligion;

    // Setup autosave only (useAutoSave in the setup wizard). Once the setup is finished, same rule
    // as PUT /api/profile: changing or clearing a stored value needs review (409); same values and
    // still-empty fields are fine. The wizard step is no longer tracked then.
    if (existing?.isComplete) {
      delete updateData.setupStep;
      // A null religion reads «مسلم»: choosing «مسيحي» is a change for review, never an empty field filled in
      const stored = { ...(existing as unknown as Record<string, unknown>), religion: religionOf(existing) };
      const changed = reviewedChanges(stored, updateData);
      if (changed.length > 0) return NextResponse.json(needsReviewBody(changed), { status: 409 });
      if (Object.keys(updateData).length === 0) return NextResponse.json({ message: "تم حفظ المسودة" });
    } else if (effectiveReligion === RELIGION_CHRISTIAN) {
      // A Christian during the setup: clear the Muslim-only answers saved before (dealbreaker checks read them).
      // Only what is actually set: every autosave read is a little stale, and rewriting `dealbreakers` from it
      // could overwrite the final PUT /api/profile's list
      Object.assign(updateData, neededMuslimOnlyClears(existing));
    }

    await db.profile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        isComplete: false,
        ...updateData,
      },
      update: updateData,
    });

    return NextResponse.json({ message: "تم حفظ المسودة" });
  } catch (error) {
    console.error("Profile draft save error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
