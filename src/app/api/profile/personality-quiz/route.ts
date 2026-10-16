import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { maybeAwardReferral } from "@/lib/referral";

const quizQuestions = [
  // --- الاجتماعية (Extraversion) - 4 questions ---
  { id: "q1", text: "أحب قضاء وقتي مع الناس أكثر من الجلوس وحدي", dimension: "extraversion", topic: "lifestyle" },
  { id: "q2", text: "أكون أول من يبدأ الحديث عندما أتعرف على شخص جديد", dimension: "extraversion", topic: "communication" },
  { id: "q3", text: "أشعر بطاقة أكبر عندما أكون بين الناس وفي التجمعات العائلية", dimension: "extraversion", topic: "communication" },
  { id: "q4", text: "أفضّل الخروج والأنشطة الاجتماعية على البقاء في البيت", dimension: "extraversion", topic: "lifestyle" },

  // --- الالتزام والتنظيم (Conscientiousness) - 4 questions ---
  { id: "q5", text: "أخطط لمستقبلي المهني والشخصي بشكل مرتب ومنظم", dimension: "conscientiousness", topic: "ambition" },
  { id: "q6", text: "أنجز عملي ومسؤولياتي دائماً قبل موعدها", dimension: "conscientiousness", topic: "decision-making" },
  { id: "q7", text: "أضع أهدافاً واضحة وأعمل بجد لتحقيقها", dimension: "conscientiousness", topic: "ambition" },
  { id: "q8", text: "أتخذ قراراتي بعد دراسة كل الخيارات بتأنٍّ", dimension: "conscientiousness", topic: "decision-making" },

  // --- التفاهم والانسجام (Agreeableness) - 4 questions ---
  { id: "q9", text: "أتأثر بمشاعر من حولي وأحاول مساعدتهم", dimension: "agreeableness", topic: "family-values" },
  { id: "q10", text: "أسامح بسرعة ولا أحمل في قلبي على أحد", dimension: "agreeableness", topic: "conflict-resolution" },
  { id: "q11", text: "رضا الوالدين وصلة الرحم من أهم الأمور في حياتي", dimension: "agreeableness", topic: "family-values" },
  { id: "q12", text: "عند حدوث خلاف، أحاول التحدث بهدوء للوصول إلى حل يرضي الجميع", dimension: "agreeableness", topic: "conflict-resolution" },

  // --- الاستقرار العاطفي (Neuroticism - reversed) - 4 questions ---
  { id: "q13", text: "أتعامل مع الضغوط والمواقف الصعبة بهدوء وثبات", dimension: "neuroticism", topic: "conflict-resolution" },
  { id: "q14", text: "أستطيع التعبير عن مشاعري ومخاوفي بوضوح دون انفعال", dimension: "neuroticism", topic: "communication" },
  { id: "q15", text: "لا أدع المشكلات اليومية تؤثر في مزاجي كثيراً", dimension: "neuroticism", topic: "lifestyle" },
  { id: "q16", text: "أتقبّل النقد البنّاء برحابة صدر وأستفيد منه في تطوير نفسي", dimension: "neuroticism", topic: "conflict-resolution" },

  // --- الانفتاح والتطوير (Openness) - 4 questions ---
  { id: "q17", text: "أستمتع بتجربة أشياء جديدة ومختلفة واكتشاف ثقافات أخرى", dimension: "openness", topic: "lifestyle" },
  { id: "q18", text: "أحب القراءة والتعلم المستمر وتطوير مهاراتي", dimension: "openness", topic: "ambition" },
  { id: "q19", text: "أؤمن بأهمية تطوير أساليب التربية مع الحفاظ على القيم الأساسية", dimension: "openness", topic: "family-values" },
  { id: "q20", text: "أرحّب بالأفكار المختلفة وأعدّ تنوع الآراء قوة وإثراءً", dimension: "openness", topic: "decision-making" },
];

// Retake cooldown in months
const RETAKE_COOLDOWN_MONTHS = 3;

function getRetakeInfo(updatedAt: Date): { canRetake: boolean; daysRemaining: number; retakeDate: Date } {
  const retakeDate = new Date(updatedAt);
  retakeDate.setMonth(retakeDate.getMonth() + RETAKE_COOLDOWN_MONTHS);

  const now = new Date();
  const canRetake = now >= retakeDate;
  const daysRemaining = canRetake ? 0 : Math.ceil((retakeDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return { canRetake, daysRemaining, retakeDate };
}

export async function GET() {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) return authResult.error;
    const { session } = authResult;

    const result = await db.personalityResult.findUnique({
      where: { userId: session.user.id },
    });

    // Strip 'topic' from questions before sending to client
    const questions = quizQuestions.map(({ topic, ...rest }) => rest);

    if (result) {
      const retakeInfo = getRetakeInfo(result.updatedAt);
      return NextResponse.json({
        questions,
        result: {
          personalityType: result.personalityType,
          vector: result.vector,
          completedAt: result.updatedAt,
          canRetake: retakeInfo.canRetake,
          daysRemaining: retakeInfo.daysRemaining,
          retakeDate: retakeInfo.retakeDate,
        },
      });
    }

    return NextResponse.json({ questions, result: null });
  } catch (error) {
    console.error("Personality quiz get error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await requireUser();
    if ("error" in authResult) return authResult.error;
    const { session } = authResult;

    // Retake policy enforcement: check if a result already exists
    const existingResult = await db.personalityResult.findUnique({
      where: { userId: session.user.id },
    });

    if (existingResult) {
      const retakeInfo = getRetakeInfo(existingResult.updatedAt);
      if (!retakeInfo.canRetake) {
        return NextResponse.json(
          {
            error: `لا يمكنك إعادة الاختبار الآن. يمكنك إعادته بعد ${retakeInfo.daysRemaining} يوم`,
            daysRemaining: retakeInfo.daysRemaining,
            retakeDate: retakeInfo.retakeDate,
          },
          { status: 400 }
        );
      }
    }

    const body = await request.json();
    const { answers } = body;

    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ error: "يرجى إرسال الإجابات" }, { status: 400 });
    }

    // Validate that all 20 questions are answered
    const answeredCount = quizQuestions.filter(
      (q) => typeof answers[q.id] === "number" && answers[q.id] >= 1 && answers[q.id] <= 5
    ).length;

    if (answeredCount < quizQuestions.length) {
      return NextResponse.json(
        { error: `يرجى الإجابة عن جميع الأسئلة (${answeredCount}/${quizQuestions.length})` },
        { status: 400 }
      );
    }

    // Calculate personality vector (5 dimensions, scale 1-5)
    // Each dimension has exactly 4 questions; the vector is the average per dimension
    const dimensions: Record<string, number[]> = {
      extraversion: [],
      conscientiousness: [],
      agreeableness: [],
      neuroticism: [],
      openness: [],
    };

    for (const q of quizQuestions) {
      const answer = answers[q.id];
      if (typeof answer === "number" && answer >= 1 && answer <= 5) {
        dimensions[q.dimension].push(answer);
      }
    }

    const dimensionKeys = ["extraversion", "conscientiousness", "agreeableness", "neuroticism", "openness"];
    const vector = dimensionKeys.map(
      (key) => {
        const scores = dimensions[key];
        return scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 3;
      }
    );

    // Determine dominant personality type
    const labels = ["الاجتماعية", "الالتزام والتنظيم", "التفاهم والانسجام", "الاستقرار العاطفي", "الانفتاح والتطوير"];
    const maxIdx = vector.indexOf(Math.max(...vector));
    const personalityType = labels[maxIdx];

    const result = await db.personalityResult.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        answers: answers,
        vector,
        personalityType,
      },
      update: {
        answers: answers,
        vector,
        personalityType,
      },
    });

    await maybeAwardReferral(session.user.id);
    return NextResponse.json({
      message: "تم حفظ نتيجة اختبار الشخصية بنجاح",
      result: {
        personalityType: result.personalityType,
        vector: result.vector,
      },
    });
  } catch (error) {
    console.error("Personality quiz error:", error);
    return NextResponse.json({ error: "حدث خطأ في الخادم" }, { status: 500 });
  }
}
