import { describe, it, expect } from "vitest";
import { profileSchema, parentInfoSchema, profileDraftSchema } from "@/lib/validations/profile";

// Base valid profile data with all required fields
const validProfile = {
  dateOfBirth: "1995-01-15",
  city: "عمّان",
  nationality: "أردني",
  education: "بكالوريوس",
  fieldOfStudy: "هندسة حاسوب",
  job: "مهندس",
  incomeRange: "500-1000 د.أ",
  height: 175,
  weight: 70,
  skinColor: "حنطي",
  childrenCount: 0,
  willingToRelocate: "yes",
  maritalStatus: "أعزب",
  religiosity: "ملتزم",
  familyValues: "أقدر العائلة كثيراً",
  partnerExpectations: "أبحث عن شريك متفهم",
  hobbies: "القراءة، السباحة",
  interests: "التكنولوجيا، الرياضة",
  lifestyle: "نشيط",
  smokingStatus: "لا أدخن",
  aboutMe: "نبذة مختصرة عني",
  area: "عبدون",
  tribe: "العبادي",
  familyOriginArea: "عمّان",
  numberOfSiblings: 3,
  housingType: "ملك",
  cookingAbility: "أطبخ جيداً",
  drivingLicense: true,
  healthConditions: "لا يوجد",
  monthlyExpenses: "500-800 د.أ",
  prefAgeMin: 20,
  prefAgeMax: 35,
  prefCity: ["عمّان", "إربد"],
  prefEducation: ["بكالوريوس", "ماجستير"],
  prefMaritalStatus: ["أعزب/عزباء"],
};

describe("profileSchema", () => {
  it("should accept valid profile data", () => {
    const result = profileSchema.safeParse(validProfile);
    expect(result.success).toBe(true);
  });

  it("should accept profile with optional fields included", () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      hijab: true,
      beard: false,
      latitude: 31.95,
      longitude: 35.93,
      wantsPhoto: true,
    });
    expect(result.success).toBe(true);
  });

  it("should reject missing required fields", () => {
    const result = profileSchema.safeParse({
      dateOfBirth: "",
      city: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject height out of range", () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      height: 50, // Too short
    });
    expect(result.success).toBe(false);
  });

  it("should reject aboutMe exceeding 500 chars", () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      aboutMe: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("should reject familyValues exceeding 500 chars", () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      familyValues: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("should reject partnerExpectations exceeding 500 chars", () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      partnerExpectations: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe("parentInfoSchema", () => {
  it("should accept valid parent info", () => {
    const result = parentInfoSchema.safeParse({
      parentName: "محمد أحمد",
      parentPhone: "0791234567",
      relationship: "father",
      address: "عمّان، شارع الجامعة، بناية رقم 5",
    });
    expect(result.success).toBe(true);
  });

  it("should accept parent info with address and notes", () => {
    const result = parentInfoSchema.safeParse({
      parentName: "فاطمة علي",
      parentPhone: "0781234567",
      relationship: "mother",
      address: "عمّان، شارع الجامعة، بناية رقم 5",
      notes: "يفضل الاتصال مساءً",
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid relationship", () => {
    const result = parentInfoSchema.safeParse({
      parentName: "أحمد",
      parentPhone: "0791234567",
      relationship: "uncle", // Not in enum
      address: "عمّان، شارع الجامعة",
    });
    expect(result.success).toBe(false);
  });

  it("should reject short phone number", () => {
    const result = parentInfoSchema.safeParse({
      parentName: "أحمد محمد",
      parentPhone: "123",
      relationship: "father",
      address: "عمّان، شارع الجامعة",
    });
    expect(result.success).toBe(false);
  });

  it("should reject short parent name", () => {
    const result = parentInfoSchema.safeParse({
      parentName: "م",
      parentPhone: "0791234567",
      relationship: "father",
      address: "عمّان، شارع الجامعة",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid relationships", () => {
    for (const rel of ["father", "mother", "brother", "guardian"]) {
      const result = parentInfoSchema.safeParse({
        parentName: "اسم ولي الأمر",
        parentPhone: "0791234567",
        relationship: rel,
        address: "عمّان، شارع الجامعة، بناية رقم 5",
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("profileDraftSchema", () => {
  it("should accept an empty object (all fields optional)", () => {
    const result = profileDraftSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("should accept partial data", () => {
    const result = profileDraftSchema.safeParse({
      city: "عمّان",
      height: 175,
      setupStep: 2,
    });
    expect(result.success).toBe(true);
  });

  it("should reject height below minimum when provided", () => {
    const result = profileDraftSchema.safeParse({ height: 50 });
    expect(result.success).toBe(false);
  });

  it("should validate setupStep range (1-5)", () => {
    expect(profileDraftSchema.safeParse({ setupStep: 0 }).success).toBe(false);
    expect(profileDraftSchema.safeParse({ setupStep: 6 }).success).toBe(false);
    expect(profileDraftSchema.safeParse({ setupStep: 3 }).success).toBe(true);
  });

  it("should accept a full valid profile as a draft", () => {
    const result = profileDraftSchema.safeParse({
      ...validProfile,
      setupStep: 5,
    });
    expect(result.success).toBe(true);
  });
});
