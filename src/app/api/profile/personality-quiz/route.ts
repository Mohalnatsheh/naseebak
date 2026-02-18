import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const quizQuestions = [
  // --- الانبساطية (Extraversion) - 4 questions ---
  // Communication style + Lifestyle
  { id: "q1", text: "أفضّل قضاء الوقت مع مجموعة كبيرة من الناس على الجلوس بمفردي", dimension: "extraversion", topic: "lifestyle" },
  { id: "q2", text: "أبادر بالحديث عند التعرف على أشخاص جدد بسهولة", dimension: "extraversion", topic: "communication" },
  { id: "q3", text: "أستمد طاقتي من التفاعل الاجتماعي والتجمعات العائلية", dimension: "extraversion", topic: "communication" },
  { id: "q4", text: "أفضّل النشاطات الخارجية والفعاليات الاجتماعية على البقاء في المنزل", dimension: "extraversion", topic: "lifestyle" },

  // --- يقظة الضمير (Conscientiousness) - 4 questions ---
  // Decision-making + Ambition
  { id: "q5", text: "أخطط لمستقبلي المهني والشخصي بشكل مفصّل ومنظّم", dimension: "conscientiousness", topic: "ambition" },
  { id: "q6", text: "أنجز مهامي ومسؤولياتي قبل المواعيد النهائية دائماً", dimension: "conscientiousness", topic: "decision-making" },
  { id: "q7", text: "أضع أهدافاً واضحة وأعمل بجد لتحقيقها خطوة بخطوة", dimension: "conscientiousness", topic: "ambition" },
  { id: "q8", text: "أتخذ قراراتي بعد دراسة جميع الخيارات بعناية وتمعّن", dimension: "conscientiousness", topic: "decision-making" },

  // --- الانسجام (Agreeableness) - 4 questions ---
  // Family values + Conflict resolution
  { id: "q9", text: "أتعاطف بسهولة مع مشاعر الآخرين وأحاول مساعدتهم", dimension: "agreeableness", topic: "family-values" },
  { id: "q10", text: "أسامح الآخرين بسهولة وأتجنب حمل الضغينة", dimension: "agreeableness", topic: "conflict-resolution" },
  { id: "q11", text: "أعتبر رضا الوالدين وصلة الرحم من أهم أولوياتي في الحياة", dimension: "agreeableness", topic: "family-values" },
  { id: "q12", text: "عند حدوث خلاف، أسعى للحوار الهادئ والوصول لحل يرضي الجميع", dimension: "agreeableness", topic: "conflict-resolution" },

  // --- الاستقرار العاطفي (Neuroticism - reversed) - 4 questions ---
  // Conflict resolution + Communication style
  { id: "q13", text: "أتعامل مع الضغوط والمواقف الصعبة بهدوء وثبات", dimension: "neuroticism", topic: "conflict-resolution" },
  { id: "q14", text: "أستطيع التعبير عن مشاعري ومخاوفي بوضوح دون انفعال", dimension: "neuroticism", topic: "communication" },
  { id: "q15", text: "لا أدع المشاكل اليومية تؤثر على مزاجي العام بشكل كبير", dimension: "neuroticism", topic: "lifestyle" },
  { id: "q16", text: "أتقبّل النقد البنّاء برحابة صدر وأستفيد منه في تطوير نفسي", dimension: "neuroticism", topic: "conflict-resolution" },

  // --- الانفتاح (Openness) - 4 questions ---
  // Lifestyle + Decision-making + Family values
  { id: "q17", text: "أستمتع بتجربة أشياء جديدة ومختلفة واكتشاف ثقافات أخرى", dimension: "openness", topic: "lifestyle" },
  { id: "q18", text: "أحب القراءة والتعلم المستمر وتطوير مهاراتي باستمرار", dimension: "openness", topic: "ambition" },
  { id: "q19", text: "أؤمن بأهمية تطوير أساليب التربية مع الحفاظ على القيم الأساسية", dimension: "openness", topic: "family-values" },
  { id: "q20", text: "أرحّب بالأفكار المختلفة وأعتبر تنوع الآراء مصدر قوة وإثراء", dimension: "openness", topic: "decision-making" },
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
    }

    // Retake policy enforcement: check if a result already exists
    const existingResult = await db.personalityResult.findUnique({
      where: { userId: session.user.id },
    });

    if (existingResult) {
      const retakeInfo = getRetakeInfo(existingResult.updatedAt);
      if (!retakeInfo.canRetake) {
        return NextResponse.json(
          {
            error: `لا يمكنك إعادة الاختبار حالياً. يمكنك إعادة الاختبار بعد ${retakeInfo.daysRemaining} يوم`,
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
      return NextResponse.json({ error: "الإجابات مطلوبة" }, { status: 400 });
    }

    // Validate that all 20 questions are answered
    const answeredCount = quizQuestions.filter(
      (q) => typeof answers[q.id] === "number" && answers[q.id] >= 1 && answers[q.id] <= 5
    ).length;

    if (answeredCount < quizQuestions.length) {
      return NextResponse.json(
        { error: `يرجى الإجابة على جميع الأسئلة (${answeredCount}/${quizQuestions.length})` },
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
    const labels = ["الانبساطية", "يقظة الضمير", "الانسجام", "الاستقرار العاطفي", "الانفتاح"];
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

    return NextResponse.json({
      message: "تم حفظ نتائج اختبار الشخصية بنجاح",
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
