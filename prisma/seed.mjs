import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith("#")) {
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx);
      let value = trimmed.substring(eqIdx + 1);
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Placeholder 1x1 transparent PNG for identity docs
const PLACEHOLDER_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function main() {
  console.log("Seeding database...\n");

  // ─── Admin ───────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash("Admin123!", 12);
  const admin = await db.user.upsert({
    where: { email: "admin@naseeb.jo" },
    update: {},
    create: {
      email: "admin@naseeb.jo",
      passwordHash: adminPassword,
      firstName: "مدير",
      lastName: "النظام",
      gender: "MALE",
      role: "ADMIN",
      status: "VERIFIED",
      isVerified: true,
      verifiedAt: new Date(),
    },
  });
  console.log("Admin created:", admin.email);

  // ─── Female Users ────────────────────────────────────────────────────────
  const females = [
    {
      phone: "962796922292", // Test number — OTP is always 111111
      email: "phone_962796922292@naseeb.local",
      firstName: "سارة",
      lastName: "أحمد",
      profile: {
        dateOfBirth: new Date("1997-03-15"),
        city: "عمّان",
        area: "عبدون",
        nationality: "أردنية",
        education: "بكالوريوس",
        fieldOfStudy: "علوم حاسوب",
        job: "مطورة برمجيات",
        incomeRange: "1000-2000 د.أ",
        height: 165,
        weight: 58,
        skinColor: "حنطي",
        childrenCount: 0,
        willingToRelocate: "maybe",
        maritalStatus: "أعزب/عزباء",
        religiosity: "ملتزم",
        familyValues: "أؤمن بأهمية التواصل والاحترام المتبادل بين أفراد العائلة",
        partnerExpectations: "أبحث عن شخص طموح ومتدين ويقدر العائلة",
        hobbies: "القراءة، البرمجة، السباحة",
        interests: "التكنولوجيا، الذكاء الاصطناعي، التعليم",
        lifestyle: "متوازن",
        hijab: true,
        smokingStatus: "لا أدخن",
        aboutMe: "مطورة برمجيات طموحة أحب التعلم المستمر والتطور. أقدر العائلة كثيراً وأسعى لبناء حياة مستقرة.",
        tribe: "العبادي",
        familyOriginArea: "عمّان",
        numberOfSiblings: 3,
        housingType: "مع العائلة",
        cookingAbility: "أطبخ جيداً",
        drivingLicense: true,
        healthConditions: "لا يوجد",
        monthlyExpenses: "300-500 د.أ",
        prefAgeMin: 25,
        prefAgeMax: 35,
        prefCity: ["عمّان", "إربد"],
        prefEducation: ["بكالوريوس", "ماجستير", "دكتوراه"],
        prefMaritalStatus: ["أعزب/عزباء"],
      },
      parent: {
        parentName: "أحمد محمد العبادي",
        parentPhone: "0791234567",
        relationship: "father",
        address: "عمّان، عبدون، شارع الأمير هاشم، بناية 12",
      },
      personality: {
        answers: { q1: 4, q2: 5, q3: 3, q4: 4, q5: 5, q6: 3, q7: 4, q8: 5, q9: 3, q10: 4, q11: 5, q12: 3, q13: 4, q14: 2, q15: 4, q16: 5, q17: 3, q18: 4, q19: 5, q20: 4 },
        vector: [0.75, 0.85, 0.70, 0.30, 0.80],
        personalityType: "تحليلي-اجتماعي",
      },
    },
    {
      phone: "962790000002",
      email: "phone_962790000002@naseeb.local",
      firstName: "نور",
      lastName: "محمود",
      profile: {
        dateOfBirth: new Date("1999-07-22"),
        city: "إربد",
        area: "الحي الشرقي",
        nationality: "أردنية",
        education: "بكالوريوس",
        fieldOfStudy: "صيدلة",
        job: "صيدلانية",
        incomeRange: "500-1000 د.أ",
        height: 160,
        weight: 55,
        skinColor: "أبيض",
        childrenCount: 0,
        willingToRelocate: "yes",
        maritalStatus: "أعزب/عزباء",
        religiosity: "ملتزم جداً",
        familyValues: "العائلة هي أساس المجتمع، أحرص على صلة الرحم والتواصل الدائم",
        partnerExpectations: "أبحث عن شخص ملتزم دينياً وذو أخلاق عالية ومستقر مادياً",
        hobbies: "الطبخ، المشي، قراءة القرآن",
        interests: "الصحة، التغذية، العمل التطوعي",
        lifestyle: "هادئ",
        hijab: true,
        smokingStatus: "لا أدخن",
        aboutMe: "صيدلانية أحب عملي وأسعى لخدمة المجتمع. هادئة الطباع وأحب الحياة البسيطة.",
        tribe: "الزعبي",
        familyOriginArea: "إربد",
        numberOfSiblings: 5,
        housingType: "ملك",
        cookingAbility: "أطبخ ممتازاً",
        drivingLicense: false,
        healthConditions: "لا يوجد",
        monthlyExpenses: "أقل من 300 د.أ",
        prefAgeMin: 26,
        prefAgeMax: 38,
        prefCity: ["إربد", "عمّان", "الزرقاء"],
        prefEducation: ["بكالوريوس", "ماجستير"],
        prefMaritalStatus: ["أعزب/عزباء"],
      },
      parent: {
        parentName: "محمود يوسف الزعبي",
        parentPhone: "0781112233",
        relationship: "father",
        address: "إربد، الحي الشرقي، شارع الملك عبدالله، عمارة 7",
      },
      personality: {
        answers: { q1: 3, q2: 5, q3: 4, q4: 5, q5: 4, q6: 4, q7: 5, q8: 4, q9: 3, q10: 5, q11: 4, q12: 4, q13: 5, q14: 2, q15: 3, q16: 5, q17: 4, q18: 5, q19: 4, q20: 3 },
        vector: [0.60, 0.90, 0.80, 0.25, 0.70],
        personalityType: "منظم-متعاطف",
      },
    },
    {
      phone: "962790000003",
      email: "phone_962790000003@naseeb.local",
      firstName: "لينا",
      lastName: "خالد",
      profile: {
        dateOfBirth: new Date("1995-11-08"),
        city: "الزرقاء",
        area: "الزرقاء الجديدة",
        nationality: "أردنية",
        education: "ماجستير",
        fieldOfStudy: "إدارة أعمال",
        job: "مديرة مشاريع",
        incomeRange: "1000-2000 د.أ",
        height: 168,
        weight: 62,
        skinColor: "أبيض",
        childrenCount: 0,
        willingToRelocate: "yes",
        maritalStatus: "أعزب/عزباء",
        religiosity: "ملتزم",
        familyValues: "الاحترام والثقة أساس كل علاقة ناجحة",
        partnerExpectations: "أبحث عن شريك حياة طموح ومثقف يشاركني أهدافي",
        hobbies: "السفر، التصوير، اليوغا",
        interests: "ريادة الأعمال، التنمية البشرية، الفنون",
        lifestyle: "نشيط",
        hijab: false,
        smokingStatus: "لا أدخن",
        aboutMe: "مديرة مشاريع بخبرة 5 سنوات. أحب التحديات وأسعى دائماً للتطور المهني والشخصي.",
        tribe: "الطراونة",
        familyOriginArea: "الكرك",
        numberOfSiblings: 2,
        housingType: "إيجار",
        cookingAbility: "أطبخ قليلاً",
        drivingLicense: true,
        healthConditions: "لا يوجد",
        monthlyExpenses: "500-800 د.أ",
        prefAgeMin: 28,
        prefAgeMax: 40,
        prefCity: ["عمّان", "الزرقاء"],
        prefEducation: ["ماجستير", "دكتوراه"],
        prefMaritalStatus: ["أعزب/عزباء", "مطلق/مطلقة"],
      },
      parent: {
        parentName: "خالد سليمان الطراونة",
        parentPhone: "0799887766",
        relationship: "father",
        address: "الزرقاء الجديدة، شارع الاستقلال، بناية 3",
      },
      personality: {
        answers: { q1: 5, q2: 4, q3: 4, q4: 3, q5: 5, q6: 5, q7: 4, q8: 3, q9: 4, q10: 3, q11: 5, q12: 4, q13: 3, q14: 3, q15: 5, q16: 4, q17: 5, q18: 3, q19: 5, q20: 5 },
        vector: [0.85, 0.75, 0.65, 0.35, 0.90],
        personalityType: "قيادي-مبدع",
      },
    },
  ];

  // ─── Male Users ──────────────────────────────────────────────────────────
  const males = [
    {
      phone: "962790000004",
      email: "phone_962790000004@naseeb.local",
      firstName: "عمر",
      lastName: "سعيد",
      profile: {
        dateOfBirth: new Date("1995-08-20"),
        city: "عمّان",
        area: "الجبيهة",
        nationality: "أردني",
        education: "ماجستير",
        fieldOfStudy: "هندسة كهربائية",
        job: "مهندس أول",
        incomeRange: "1000-2000 د.أ",
        height: 178,
        weight: 80,
        skinColor: "حنطي",
        childrenCount: 0,
        willingToRelocate: "maybe",
        maritalStatus: "أعزب/عزباء",
        religiosity: "ملتزم",
        familyValues: "العائلة هي الأولوية القصوى في حياتي وأسعى لبنائها على أسس متينة",
        partnerExpectations: "أبحث عن شريكة متفهمة ومثقفة تقدر الحياة العائلية",
        hobbies: "كرة القدم، القراءة، الرحلات",
        interests: "الهندسة، التكنولوجيا، الاستثمار",
        lifestyle: "نشيط",
        beard: true,
        smokingStatus: "لا أدخن",
        aboutMe: "مهندس كهربائي طموح أعمل في قطاع الطاقة. أحب الرياضة والقراءة وأسعى لحياة مستقرة.",
        tribe: "البطاينة",
        familyOriginArea: "إربد",
        numberOfSiblings: 4,
        housingType: "ملك",
        cookingAbility: "أطبخ قليلاً",
        drivingLicense: true,
        healthConditions: "لا يوجد",
        monthlyExpenses: "500-800 د.أ",
        prefAgeMin: 22,
        prefAgeMax: 30,
        prefCity: ["عمّان", "إربد"],
        prefEducation: ["بكالوريوس", "ماجستير"],
        prefMaritalStatus: ["أعزب/عزباء"],
      },
      parent: {
        parentName: "سعيد حسن البطاينة",
        parentPhone: "0787654321",
        relationship: "father",
        address: "عمّان، الجبيهة، شارع الجامعة، فيلا 22",
      },
      personality: {
        answers: { q1: 4, q2: 4, q3: 5, q4: 4, q5: 4, q6: 4, q7: 5, q8: 4, q9: 3, q10: 4, q11: 4, q12: 5, q13: 4, q14: 2, q15: 4, q16: 4, q17: 4, q18: 5, q19: 4, q20: 4 },
        vector: [0.70, 0.80, 0.85, 0.25, 0.75],
        personalityType: "عملي-اجتماعي",
      },
    },
    {
      phone: "962790000005",
      email: "phone_962790000005@naseeb.local",
      firstName: "أحمد",
      lastName: "يوسف",
      profile: {
        dateOfBirth: new Date("1993-01-12"),
        city: "إربد",
        area: "حي الحسين",
        nationality: "أردني",
        education: "دكتوراه",
        fieldOfStudy: "طب بشري",
        job: "طبيب",
        incomeRange: "أكثر من 2000 د.أ",
        height: 182,
        weight: 85,
        skinColor: "أبيض",
        childrenCount: 0,
        willingToRelocate: "no",
        maritalStatus: "أعزب/عزباء",
        religiosity: "ملتزم جداً",
        familyValues: "أحرص على بناء عائلة متماسكة مبنية على المودة والرحمة",
        partnerExpectations: "أبحث عن شريكة ملتزمة دينياً وذات أخلاق حميدة ومتعلمة",
        hobbies: "القراءة، الخيل، السباحة",
        interests: "الطب، البحث العلمي، العمل الخيري",
        lifestyle: "متوازن",
        beard: true,
        smokingStatus: "لا أدخن",
        aboutMe: "طبيب متخصص أحب مهنتي وأسعى لخدمة المجتمع. أقدر العلم والأخلاق.",
        tribe: "المعايطة",
        familyOriginArea: "الكرك",
        numberOfSiblings: 6,
        housingType: "ملك",
        cookingAbility: "لا أطبخ",
        drivingLicense: true,
        healthConditions: "لا يوجد",
        monthlyExpenses: "أكثر من 800 د.أ",
        prefAgeMin: 22,
        prefAgeMax: 32,
        prefCity: ["إربد", "عمّان"],
        prefEducation: ["بكالوريوس", "ماجستير", "دكتوراه"],
        prefMaritalStatus: ["أعزب/عزباء"],
      },
      parent: {
        parentName: "يوسف عبدالله المعايطة",
        parentPhone: "0771234567",
        relationship: "father",
        address: "إربد، حي الحسين، شارع فلسطين، بناية 15",
      },
      personality: {
        answers: { q1: 3, q2: 5, q3: 5, q4: 5, q5: 4, q6: 3, q7: 5, q8: 5, q9: 4, q10: 5, q11: 3, q12: 5, q13: 5, q14: 1, q15: 3, q16: 5, q17: 4, q18: 5, q19: 4, q20: 3 },
        vector: [0.55, 0.95, 0.90, 0.20, 0.65],
        personalityType: "تحليلي-منضبط",
      },
    },
    {
      phone: "962790000006",
      email: "phone_962790000006@naseeb.local",
      firstName: "خالد",
      lastName: "ناصر",
      profile: {
        dateOfBirth: new Date("1996-05-30"),
        city: "الزرقاء",
        area: "جبل الأمير حسن",
        nationality: "أردني",
        education: "بكالوريوس",
        fieldOfStudy: "محاسبة",
        job: "محاسب أول",
        incomeRange: "500-1000 د.أ",
        height: 175,
        weight: 75,
        skinColor: "حنطي",
        childrenCount: 0,
        willingToRelocate: "yes",
        maritalStatus: "أعزب/عزباء",
        religiosity: "ملتزم",
        familyValues: "أقدر الصدق والوفاء وأسعى لبناء أسرة سعيدة",
        partnerExpectations: "أبحث عن شريكة مسؤولة وطيبة القلب تحب الحياة العائلية",
        hobbies: "المشي، الطبخ، مشاهدة الأفلام الوثائقية",
        interests: "المالية، العقارات، التكنولوجيا",
        lifestyle: "اجتماعي",
        beard: false,
        smokingStatus: "تركت التدخين",
        aboutMe: "محاسب طموح أعمل على تطوير نفسي مهنياً. أحب الحياة الاجتماعية وأقدر العلاقات الأسرية.",
        tribe: "الحنيطي",
        familyOriginArea: "الزرقاء",
        numberOfSiblings: 3,
        housingType: "مع العائلة",
        cookingAbility: "أطبخ جيداً",
        drivingLicense: true,
        healthConditions: "لا يوجد",
        monthlyExpenses: "300-500 د.أ",
        prefAgeMin: 20,
        prefAgeMax: 30,
        prefCity: ["الزرقاء", "عمّان"],
        prefEducation: ["بكالوريوس", "ماجستير"],
        prefMaritalStatus: ["أعزب/عزباء", "مطلق/مطلقة"],
      },
      parent: {
        parentName: "ناصر فهد الحنيطي",
        parentPhone: "0791122334",
        relationship: "father",
        address: "الزرقاء، جبل الأمير حسن، شارع المدينة المنورة، بناية 9",
      },
      personality: {
        answers: { q1: 5, q2: 3, q3: 4, q4: 3, q5: 4, q6: 5, q7: 3, q8: 3, q9: 4, q10: 3, q11: 5, q12: 4, q13: 3, q14: 3, q15: 5, q16: 3, q17: 5, q18: 3, q19: 5, q20: 5 },
        vector: [0.80, 0.65, 0.70, 0.40, 0.85],
        personalityType: "اجتماعي-مبدع",
      },
    },
  ];

  // ─── Create Users ────────────────────────────────────────────────────────
  const createdFemales = [];
  for (const f of females) {
    const user = await db.user.upsert({
      where: { email: f.email },
      update: {},
      create: {
        email: f.email,
        phone: f.phone,
        firstName: f.firstName,
        lastName: f.lastName,
        gender: "FEMALE",
        status: "VERIFIED",
        isVerified: true,
        verifiedAt: new Date(),
        matchCredits: 10,
        profile: {
          create: { ...f.profile, isComplete: true },
        },
        parentInfo: {
          create: f.parent,
        },
        personalityResult: {
          create: f.personality,
        },
        identityDoc: {
          create: {
            frontImageUrl: PLACEHOLDER_IMG,
            backImageUrl: PLACEHOLDER_IMG,
            documentType: "national_id",
            status: "APPROVED",
            reviewedById: admin.id,
            reviewedAt: new Date(),
          },
        },
      },
    });
    createdFemales.push(user);
    console.log(`Female created: ${f.firstName} ${f.lastName} (${f.phone})`);
  }

  const createdMales = [];
  for (const m of males) {
    const user = await db.user.upsert({
      where: { email: m.email },
      update: {},
      create: {
        email: m.email,
        phone: m.phone,
        firstName: m.firstName,
        lastName: m.lastName,
        gender: "MALE",
        status: "VERIFIED",
        isVerified: true,
        verifiedAt: new Date(),
        matchCredits: 10,
        profile: {
          create: { ...m.profile, isComplete: true },
        },
        parentInfo: {
          create: m.parent,
        },
        personalityResult: {
          create: m.personality,
        },
        identityDoc: {
          create: {
            frontImageUrl: PLACEHOLDER_IMG,
            backImageUrl: PLACEHOLDER_IMG,
            documentType: "national_id",
            status: "APPROVED",
            reviewedById: admin.id,
            reviewedAt: new Date(),
          },
        },
      },
    });
    createdMales.push(user);
    console.log(`Male created: ${m.firstName} ${m.lastName} (${m.phone})`);
  }

  // ─── Suggestions (each female gets suggestions from all males) ───────────
  const scores = [
    [87.5, 72.0, 65.0],  // Sara ↔ Omar, Ahmad, Khaled
    [78.0, 92.0, 60.5],  // Noor ↔ Omar, Ahmad, Khaled
    [69.0, 74.5, 85.0],  // Lina ↔ Omar, Ahmad, Khaled
  ];

  // Track suggestions by [femaleIdx][maleIdx]
  const suggestions = [];
  for (let fi = 0; fi < createdFemales.length; fi++) {
    suggestions[fi] = [];
    for (let mi = 0; mi < createdMales.length; mi++) {
      const s = await db.suggestion.upsert({
        where: {
          femaleId_maleId: {
            femaleId: createdFemales[fi].id,
            maleId: createdMales[mi].id,
          },
        },
        update: {},
        create: {
          femaleId: createdFemales[fi].id,
          maleId: createdMales[mi].id,
          compatibilityScore: scores[fi][mi],
          source: "AI",
          status: "PENDING",
        },
      });
      suggestions[fi][mi] = s;
    }
  }
  console.log("9 suggestions created (3 females × 3 males)");

  const [sara, noor, lina] = createdFemales;
  const [omar, ahmad, khaled] = createdMales;

  // ─── Mutual Match: Sara ↔ Omar (87.5%, visit: FAMILIES_CONTACTED) ──────
  // Update suggestion to ACCEPTED
  await db.suggestion.update({
    where: { id: suggestions[0][0].id },
    data: { status: "ACCEPTED" },
  });

  // Likes both ways
  await db.like.upsert({
    where: { fromUserId_toUserId: { fromUserId: sara.id, toUserId: omar.id } },
    update: {},
    create: { fromUserId: sara.id, toUserId: omar.id, suggestionId: suggestions[0][0].id, isLiked: true },
  });
  await db.like.upsert({
    where: { fromUserId_toUserId: { fromUserId: omar.id, toUserId: sara.id } },
    update: {},
    create: { fromUserId: omar.id, toUserId: sara.id, suggestionId: suggestions[0][0].id, isLiked: true },
  });

  // MutualMatch + VisitRequest
  const match1 = await db.mutualMatch.upsert({
    where: { femaleId_maleId: { femaleId: sara.id, maleId: omar.id } },
    update: {},
    create: {
      femaleId: sara.id,
      maleId: omar.id,
      suggestionId: suggestions[0][0].id,
      photosRevealed: true,
      revealedByFemale: true,
      visitRequest: {
        create: { status: "FAMILIES_CONTACTED", adminNotes: "تم التواصل مع عائلة سارة وعائلة عمر" },
      },
    },
  });

  // Notifications for the match
  await db.notification.createMany({
    data: [
      { userId: sara.id, type: "MATCH", title: "توافق متبادل!", body: "لديك توافق متبادل مع عمر. يمكنك الآن مشاهدة الصور.", isRead: false },
      { userId: omar.id, type: "MATCH", title: "توافق متبادل!", body: "لديك توافق متبادل مع سارة. يمكنك الآن مشاهدة الصور.", isRead: false },
      { userId: sara.id, type: "VISIT_UPDATE", title: "تحديث الزيارة", body: "تم التواصل مع العائلتين لترتيب الزيارة.", isRead: false },
      { userId: omar.id, type: "VISIT_UPDATE", title: "تحديث الزيارة", body: "تم التواصل مع العائلتين لترتيب الزيارة.", isRead: false },
    ],
  });
  console.log("Match 1: سارة ↔ عمر (mutual match, visit: FAMILIES_CONTACTED)");

  // ─── Mutual Match: Noor ↔ Ahmad (92%, visit: SCHEDULED) ────────────────
  await db.suggestion.update({
    where: { id: suggestions[1][1].id },
    data: { status: "ACCEPTED" },
  });

  await db.like.upsert({
    where: { fromUserId_toUserId: { fromUserId: noor.id, toUserId: ahmad.id } },
    update: {},
    create: { fromUserId: noor.id, toUserId: ahmad.id, suggestionId: suggestions[1][1].id, isLiked: true },
  });
  await db.like.upsert({
    where: { fromUserId_toUserId: { fromUserId: ahmad.id, toUserId: noor.id } },
    update: {},
    create: { fromUserId: ahmad.id, toUserId: noor.id, suggestionId: suggestions[1][1].id, isLiked: true },
  });

  const match2 = await db.mutualMatch.upsert({
    where: { femaleId_maleId: { femaleId: noor.id, maleId: ahmad.id } },
    update: {},
    create: {
      femaleId: noor.id,
      maleId: ahmad.id,
      suggestionId: suggestions[1][1].id,
      photosRevealed: true,
      revealedByFemale: true,
      visitRequest: {
        create: {
          status: "SCHEDULED",
          adminNotes: "تم تحديد موعد الزيارة",
          scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
          location: "منزل عائلة الزعبي - إربد",
        },
      },
    },
  });

  await db.notification.createMany({
    data: [
      { userId: noor.id, type: "MATCH", title: "توافق متبادل!", body: "لديك توافق متبادل مع أحمد. يمكنك الآن مشاهدة الصور.", isRead: true },
      { userId: ahmad.id, type: "MATCH", title: "توافق متبادل!", body: "لديك توافق متبادل مع نور. يمكنك الآن مشاهدة الصور.", isRead: true },
      { userId: noor.id, type: "VISIT_UPDATE", title: "موعد الزيارة", body: "تم تحديد موعد الزيارة العائلية. يرجى الاستعداد.", isRead: false },
      { userId: ahmad.id, type: "VISIT_UPDATE", title: "موعد الزيارة", body: "تم تحديد موعد الزيارة العائلية. يرجى الاستعداد.", isRead: false },
    ],
  });
  console.log("Match 2: نور ↔ أحمد (mutual match, visit: SCHEDULED)");

  // ─── Lina ↔ Khaled: One-way interest (Lina accepted, Khaled pending) ──
  await db.suggestion.update({
    where: { id: suggestions[2][2].id },
    data: { status: "ACCEPTED" },
  });

  await db.like.upsert({
    where: { fromUserId_toUserId: { fromUserId: lina.id, toUserId: khaled.id } },
    update: {},
    create: { fromUserId: lina.id, toUserId: khaled.id, suggestionId: suggestions[2][2].id, isLiked: true },
  });

  await db.notification.create({
    data: { userId: khaled.id, type: "INTEREST", title: "اهتمام جديد!", body: "شخص ما أبدى اهتماماً بك. قم بمراجعة الاقتراحات.", isRead: false },
  });
  console.log("Interest: لينا → خالد (one-way, pending his response)");

  // ─── WALKTHROUGH TEST PAIR (clean, no matches — test the full flow) ────
  const testFemale = await db.user.upsert({
    where: { email: "phone_962777000001@naseeb.local" },
    update: {},
    create: {
      email: "phone_962777000001@naseeb.local",
      phone: "962777000001",
      firstName: "هديل",
      lastName: "ياسين",
      gender: "FEMALE",
      status: "VERIFIED",
      isVerified: true,
      verifiedAt: new Date(),
      matchCredits: 10,
      profile: {
        create: {
          dateOfBirth: new Date("1998-06-10"),
          city: "عمّان",
          area: "الصويفية",
          nationality: "أردنية",
          education: "بكالوريوس",
          fieldOfStudy: "تصميم جرافيك",
          job: "مصممة",
          incomeRange: "500-1000 د.أ",
          height: 163,
          weight: 56,
          skinColor: "أبيض",
          childrenCount: 0,
          willingToRelocate: "maybe",
          maritalStatus: "أعزب/عزباء",
          religiosity: "ملتزم",
          familyValues: "أؤمن بأن الأسرة المتحابة هي سر السعادة",
          partnerExpectations: "أبحث عن شخص صادق وطموح يحب الحياة ويقدر الشراكة الحقيقية",
          hobbies: "الرسم، التصوير، السفر",
          interests: "الفنون، التصميم، الموسيقى",
          lifestyle: "نشيط",
          hijab: true,
          smokingStatus: "لا أدخن",
          aboutMe: "مصممة جرافيك أحب الإبداع والفن. أبحث عن شريك حياة يشاركني طموحاتي وأحلامي.",
          tribe: "الشمايلة",
          familyOriginArea: "السلط",
          numberOfSiblings: 2,
          housingType: "مع العائلة",
          cookingAbility: "أطبخ جيداً",
          drivingLicense: true,
          healthConditions: "لا يوجد",
          monthlyExpenses: "300-500 د.أ",
          prefAgeMin: 25,
          prefAgeMax: 35,
          prefCity: ["عمّان", "السلط"],
          prefEducation: ["بكالوريوس", "ماجستير"],
          prefMaritalStatus: ["أعزب/عزباء"],
          isComplete: true,
        },
      },
      parentInfo: {
        create: {
          parentName: "ياسين عبدالرحمن الشمايلة",
          parentPhone: "0795551234",
          relationship: "father",
          address: "عمّان، الصويفية، شارع الوكالات، بناية 5",
        },
      },
      personalityResult: {
        create: {
          answers: { q1: 5, q2: 4, q3: 4, q4: 3, q5: 5, q6: 4, q7: 4, q8: 3, q9: 4, q10: 4, q11: 5, q12: 3, q13: 4, q14: 2, q15: 5, q16: 4, q17: 4, q18: 3, q19: 5, q20: 4 },
          vector: [0.80, 0.70, 0.75, 0.30, 0.85],
          personalityType: "مبدع-اجتماعي",
        },
      },
      identityDoc: {
        create: {
          frontImageUrl: PLACEHOLDER_IMG,
          backImageUrl: PLACEHOLDER_IMG,
          documentType: "national_id",
          status: "APPROVED",
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      },
    },
  });
  console.log(`Test female created: هديل ياسين (0777000001)`);

  const testMale = await db.user.upsert({
    where: { email: "phone_962777000002@naseeb.local" },
    update: {},
    create: {
      email: "phone_962777000002@naseeb.local",
      phone: "962777000002",
      firstName: "يزن",
      lastName: "حسان",
      gender: "MALE",
      status: "VERIFIED",
      isVerified: true,
      verifiedAt: new Date(),
      matchCredits: 10,
      profile: {
        create: {
          dateOfBirth: new Date("1994-02-18"),
          city: "عمّان",
          area: "خلدا",
          nationality: "أردني",
          education: "ماجستير",
          fieldOfStudy: "هندسة برمجيات",
          job: "مدير تقني",
          incomeRange: "أكثر من 2000 د.أ",
          height: 180,
          weight: 78,
          skinColor: "حنطي",
          childrenCount: 0,
          willingToRelocate: "no",
          maritalStatus: "أعزب/عزباء",
          religiosity: "ملتزم",
          familyValues: "العائلة هي الركيزة الأساسية في حياتي، أسعى لبناء بيت مستقر",
          partnerExpectations: "أبحث عن شريكة متعلمة ومبدعة تقدر العائلة والطموح",
          hobbies: "البرمجة، كرة السلة، القراءة",
          interests: "التكنولوجيا، ريادة الأعمال، الرياضة",
          lifestyle: "متوازن",
          beard: false,
          smokingStatus: "لا أدخن",
          aboutMe: "مدير تقني في شركة ناشئة، أحب التكنولوجيا والابتكار. أبحث عن شريكة حياة تشاركني المشوار.",
          tribe: "القضاة",
          familyOriginArea: "عمّان",
          numberOfSiblings: 3,
          housingType: "ملك",
          cookingAbility: "أطبخ قليلاً",
          drivingLicense: true,
          healthConditions: "لا يوجد",
          monthlyExpenses: "أكثر من 800 د.أ",
          prefAgeMin: 22,
          prefAgeMax: 30,
          prefCity: ["عمّان"],
          prefEducation: ["بكالوريوس", "ماجستير"],
          prefMaritalStatus: ["أعزب/عزباء"],
          isComplete: true,
        },
      },
      parentInfo: {
        create: {
          parentName: "حسان محمد القضاة",
          parentPhone: "0795559876",
          relationship: "father",
          address: "عمّان، خلدا، شارع الأمير حسن، فيلا 18",
        },
      },
      personalityResult: {
        create: {
          answers: { q1: 4, q2: 5, q3: 4, q4: 4, q5: 4, q6: 4, q7: 5, q8: 4, q9: 3, q10: 4, q11: 4, q12: 4, q13: 4, q14: 2, q15: 4, q16: 5, q17: 4, q18: 4, q19: 4, q20: 4 },
          vector: [0.75, 0.80, 0.80, 0.25, 0.80],
          personalityType: "قيادي-تحليلي",
        },
      },
      identityDoc: {
        create: {
          frontImageUrl: PLACEHOLDER_IMG,
          backImageUrl: PLACEHOLDER_IMG,
          documentType: "national_id",
          status: "APPROVED",
          reviewedById: admin.id,
          reviewedAt: new Date(),
        },
      },
    },
  });
  console.log(`Test male created: يزن حسان (0777000002)`);

  // One pending suggestion: هديل sees يزن as a suggestion (91% match)
  await db.suggestion.upsert({
    where: { femaleId_maleId: { femaleId: testFemale.id, maleId: testMale.id } },
    update: {},
    create: {
      femaleId: testFemale.id,
      maleId: testMale.id,
      compatibilityScore: 91.0,
      source: "AI",
      status: "PENDING",
    },
  });
  console.log("Suggestion: هديل ← يزن (91%, PENDING — ready for walkthrough)");

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                 Test Accounts (OTP = 111111)                ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  Admin:   admin@naseeb.jo  /  Admin123!                     ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  ★ WALKTHROUGH PAIR (clean — test full flow):               ║");
  console.log("║  هديل (Female)  0777000001  OTP=111111                      ║");
  console.log("║  يزن  (Male)    0777000002  OTP=111111                      ║");
  console.log("║  → Login as هديل → see suggestion → accept                 ║");
  console.log("║  → Login as يزن  → see interest → accept → mutual match!   ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log("║  Other test users:                                          ║");
  console.log("║  سارة 0796922292 | نور 0790000002 | لينا 0790000003        ║");
  console.log("║  عمر 0790000004  | أحمد 0790000005 | خالد 0790000006       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
}

main().catch(console.error).finally(() => db.$disconnect());
