import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = 10;

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

    // Get IDs of users I've already responded to
    const myResponses = await db.like.findMany({
      where: { fromUserId: session.user.id },
      select: { toUserId: true },
    });
    const excludeIds = new Set([...blockedIds]);
    myResponses.forEach((r) => excludeIds.add(r.toUserId));

    const where = {
      toUserId: session.user.id,
      isLiked: true,
      ...(excludeIds.size > 0 && {
        fromUserId: { notIn: [...excludeIds] },
      }),
    };

    // Find likes directed at this user (paginated, excluding blocked & responded)
    const [likes, total] = await Promise.all([
      db.like.findMany({
        where,
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.like.count({ where }),
    ]);

    // Fetch compatibility scores from Suggestion table (scoped to page items)
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

    const interests = likes
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
            id: l.fromUser.id,
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

    return NextResponse.json({ interests, page, totalPages: Math.ceil(total / pageSize), total });
  } catch (error) {
    console.error("Received interests error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
