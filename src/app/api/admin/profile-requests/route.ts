import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const requests = await db.profileUpdateRequest.findMany({
      where: { status: "PENDING" },
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, gender: true,
            profile: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Admin profile requests error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const result = await requireAdmin();
    if ("error" in result) return result.error;
    const { session } = result;

    const body = await request.json();
    const { requestId, action, adminNote } = body;

    if (!requestId || !["APPROVED", "REJECTED"].includes(action)) {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const updateRequest = await db.profileUpdateRequest.findUnique({
      where: { id: requestId },
    });

    if (!updateRequest || updateRequest.status !== "PENDING") {
      return NextResponse.json({ error: "الطلب غير موجود أو تمت مراجعته" }, { status: 404 });
    }

    // If approved, apply the changes to the profile
    if (action === "APPROVED") {
      const changes = updateRequest.changes as Record<string, unknown>;
      const updateData: Record<string, unknown> = {};

      // Map allowed fields
      const allowedFields = [
        "city", "area", "nationality", "education", "job", "maritalStatus",
        "religiosity", "smokingStatus", "aboutMe", "partnerExpectations",
        "hobbies", "familyValues", "tribe", "familyOriginArea", "housingType",
        "monthlyExpenses", "healthConditions", "cookingAbility", "skinColor", "incomeRange",
        "prefCity", "prefEducation", "prefMaritalStatus",
        "prefHijab", "prefBeard", "prefChildrenAcceptance",
      ];

      const intFields = ["height", "weight", "numberOfSiblings", "childrenCount", "prefAgeMin", "prefAgeMax"];
      const boolFields = ["hijab", "beard", "drivingLicense"];
      const arrayFields = ["prefReligiosity", "prefSmokingStatus"];

      for (const [key, value] of Object.entries(changes)) {
        if (allowedFields.includes(key)) {
          updateData[key] = value;
        } else if (intFields.includes(key)) {
          updateData[key] = value != null ? parseInt(String(value)) : null;
        } else if (boolFields.includes(key)) {
          updateData[key] = value;
        } else if (arrayFields.includes(key)) {
          updateData[key] = Array.isArray(value) ? value : [];
        } else if (key === "dateOfBirth" && value) {
          updateData[key] = new Date(String(value));
        }
      }

      if (Object.keys(updateData).length > 0) {
        await db.profile.update({
          where: { userId: updateRequest.userId },
          data: updateData,
        });
      }
    }

    // Update the request status
    const updated = await db.profileUpdateRequest.update({
      where: { id: requestId },
      data: {
        status: action,
        adminNote: adminNote || null,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: action === "APPROVED" ? "تمت الموافقة على التعديل" : "تم رفض التعديل",
      request: updated,
    });
  } catch (error) {
    console.error("Admin profile request review error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
