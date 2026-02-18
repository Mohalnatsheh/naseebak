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

async function main() {
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

  const testPw = await bcrypt.hash("Test1234!", 12);
  const female = await db.user.upsert({
    where: { email: "sara@test.com" },
    update: {},
    create: {
      email: "sara@test.com",
      passwordHash: testPw,
      firstName: "سارة",
      lastName: "أحمد",
      gender: "FEMALE",
      status: "VERIFIED",
      isVerified: true,
      verifiedAt: new Date(),
      profile: {
        create: {
          dateOfBirth: new Date("1997-03-15"),
          city: "عمّان",
          nationality: "أردنية",
          education: "بكالوريوس",
          fieldOfStudy: "علوم حاسوب",
          job: "مطورة برمجيات",
          maritalStatus: "عزباء",
          religiosity: "ملتزمة",
          isComplete: true,
        },
      },
      parentInfo: {
        create: {
          parentName: "أحمد محمد",
          parentPhone: "0791234567",
          relationship: "father",
          address: "عمّان - شارع الجامعة",
        },
      },
    },
  });
  console.log("Female user created:", female.email);

  const male = await db.user.upsert({
    where: { email: "omar@test.com" },
    update: {},
    create: {
      email: "omar@test.com",
      passwordHash: testPw,
      firstName: "عمر",
      lastName: "خالد",
      gender: "MALE",
      status: "VERIFIED",
      isVerified: true,
      verifiedAt: new Date(),
      profile: {
        create: {
          dateOfBirth: new Date("1995-08-20"),
          city: "إربد",
          nationality: "أردني",
          education: "ماجستير",
          fieldOfStudy: "هندسة كهربائية",
          job: "مهندس",
          maritalStatus: "أعزب",
          religiosity: "ملتزم",
          isComplete: true,
        },
      },
      parentInfo: {
        create: {
          parentName: "خالد سعيد",
          parentPhone: "0787654321",
          relationship: "father",
          address: "إربد - شارع الحصن",
        },
      },
    },
  });
  console.log("Male user created:", male.email);

  await db.suggestion.upsert({
    where: { femaleId_maleId: { femaleId: female.id, maleId: male.id } },
    update: {},
    create: {
      femaleId: female.id,
      maleId: male.id,
      compatibilityScore: 87.5,
      source: "AI",
      status: "PENDING",
    },
  });
  console.log("Suggestion created");

  console.log("\n=== Test Accounts ===");
  console.log("Admin:  admin@naseeb.jo / Admin123!");
  console.log("Female: sara@test.com  / Test1234!");
  console.log("Male:   omar@test.com  / Test1234!");
}

main().catch(console.error).finally(() => db.$disconnect());
