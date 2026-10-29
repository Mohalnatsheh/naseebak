/**
 * Country settings seed (multi-country 2026-10-29).
 *
 *   node prisma/seed-countries.mjs          → creates the Jordan row if missing (today's live behaviour: active,
 *                                             registration open, purchases on). Never overwrites an admin's edits.
 *                                             Safe on any database — it creates no users and no payments.
 *   node prisma/seed-countries.mjs --dev    → LOCAL ONLY (refuses a non-localhost DATABASE_URL): also opens Saudi
 *                                             Arabia for testing (active, registration open, purchases OFF — SAR
 *                                             prices are not approved) and creates two Saudi test members with finished
 *                                             profiles (0500000771 woman, 0500000772 man — add them to
 *                                             EXTRA_TEST_PHONES to sign in with 111111).
 *
 * Run with the database address set explicitly, e.g.
 *   DATABASE_URL="postgresql://naseeb@localhost:5434/naseeb_mobile" node prisma/seed-countries.mjs --dev
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const DEV = process.argv.includes("--dev");
const url = process.env.DATABASE_URL ?? "";
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
if (DEV && !/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) {
  console.error("--dev only runs against a localhost database. Refusing:", url.replace(/:[^:@/]*@/, ":***@"));
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function ensure(code, data) {
  const existing = await db.countrySetting.findUnique({ where: { code } });
  if (existing) {
    console.log(`${code}: already configured (left as is)`);
    return existing;
  }
  const row = await db.countrySetting.create({ data: { code, ...data } });
  console.log(`${code}: created`);
  return row;
}

async function main() {
  await ensure("JO", { active: true, registrationOpen: true, purchasesEnabled: true, smsProvider: "DEFAULT", supportEmail: "info@naseebak.com" });

  if (!DEV) return;

  await ensure("SA", { active: true, registrationOpen: true, purchasesEnabled: false, smsProvider: "DEFAULT" });

  const base = {
    nationality: "سعودية",
    education: "بكالوريوس",
    maritalStatus: "أعزب/عزباء",
    religiosity: "ملتزم",
    childrenCount: 0,
    prefAgeMin: 24,
    prefAgeMax: 38,
    prefCity: ["الرياض", "جدة"],
    prefEducation: ["بكالوريوس"],
    prefMaritalStatus: ["أعزب/عزباء"],
    isComplete: true,
  };
  const people = [
    { phone: "966500000771", firstName: "ريم", lastName: "تجربة", gender: "FEMALE", profile: { ...base, dateOfBirth: new Date("1998-04-10"), city: "الرياض", hijab: true, job: "معلمة" } },
    { phone: "966500000772", firstName: "فهد", lastName: "تجربة", gender: "MALE", profile: { ...base, nationality: "سعودي", dateOfBirth: new Date("1994-09-02"), city: "الرياض", job: "مهندس" } },
  ];
  for (const p of people) {
    const email = `phone_${p.phone}@naseeb.local`;
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        phone: p.phone,
        firstName: p.firstName,
        lastName: p.lastName,
        gender: p.gender,
        country: "SA",
        status: "PENDING",
        matchCredits: 3,
        termsAcceptedAt: new Date(),
        lastActiveAt: new Date(),
        profile: { create: p.profile },
      },
    });
    console.log(`SA test member: ${p.firstName} ${p.phone} (${user.id})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
