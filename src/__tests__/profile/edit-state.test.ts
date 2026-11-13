import { describe, it, expect, vi } from "vitest";
import { DEALBREAKERS_KEY, planSave, rowState, runSave, saveSummary } from "@/lib/profile-edit-state";
import { editField } from "@/lib/profile-edit-fields";

const stored: Record<string, unknown> = {
  dateOfBirth: "1995-01-15T00:00:00.000Z",
  city: "عمّان",
  area: null,
  nationality: "أردني",
  education: "بكالوريوس",
  maritalStatus: "أعزب/عزباء",
  religiosity: "ملتزم",
  prefAgeMin: 22,
  prefAgeMax: 30,
  fieldOfStudy: null,
  aboutMe: "نبذة قديمة",
  hobbies: "",
  height: 175,
  drivingLicense: false,
  hijab: true,
  niqab: null,
};

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function api(over: Partial<Record<"postPrefs" | "putDealbreakers" | "putProfile" | "postReview", () => Promise<Response>>> = {}) {
  return {
    postPrefs: vi.fn(over.postPrefs ?? (async () => json(200))),
    putDealbreakers: vi.fn(over.putDealbreakers ?? (async () => json(200))),
    putProfile: vi.fn(over.putProfile ?? (async () => json(200))),
    postReview: vi.fn(over.postReview ?? (async () => json(200))),
  };
}

const labelOf = (key: string) => editField(key)?.label("MALE") ?? key;

describe("rowState", () => {
  it("returns locked for stored keys while a request is pending, fill for empty keys", () => {
    expect(rowState("city", stored, {}, ["aboutMe"])).toBe("locked");
    expect(rowState("drivingLicense", stored, {}, ["aboutMe"])).toBe("locked"); // a stored false is an answer
    expect(rowState("aboutMe", stored, {}, ["aboutMe"])).toBe("pending");
    expect(rowState("fieldOfStudy", stored, {}, ["aboutMe"])).toBe("idle");
    expect(rowState("fieldOfStudy", stored, { fieldOfStudy: "هندسة" }, ["aboutMe"])).toBe("fill");
    expect(rowState("hobbies", stored, { hobbies: "القراءة" }, ["aboutMe"])).toBe("fill");
  });

  it("is idle, fill or review with no request pending", () => {
    expect(rowState("city", stored, {}, null)).toBe("idle");
    expect(rowState("city", stored, { city: "إربد" }, null)).toBe("review");
    expect(rowState("fieldOfStudy", stored, { fieldOfStudy: "طب" }, null)).toBe("fill");
    expect(rowState("drivingLicense", stored, { drivingLicense: true }, null)).toBe("review");
  });

  it("changing a value back to stored is idle", () => {
    expect(rowState("city", stored, { city: "عمّان" }, null)).toBe("idle");
    expect(rowState("height", stored, { height: "175" }, null)).toBe("idle");
    expect(rowState("dateOfBirth", stored, { dateOfBirth: "1995-01-15" }, null)).toBe("idle");
    expect(rowState("fieldOfStudy", stored, { fieldOfStudy: "" }, null)).toBe("idle");
    expect(rowState("prefAgeMin", stored, { prefAgeMin: 22 }, null)).toBe("idle");
  });

  it("hijab and niqab go to review together", () => {
    const changes = { hijab: false };
    expect(rowState("hijab", stored, changes, null)).toBe("review");
    expect(rowState("niqab", stored, changes, null)).toBe("review");
  });

  it("hijab and niqab share pending and locked", () => {
    expect(rowState("niqab", stored, {}, ["hijab"])).toBe("pending");
    expect(rowState("niqab", stored, {}, ["city"])).toBe("locked");
    expect(rowState("hijab", { hijab: null, niqab: null }, {}, ["city"])).toBe("idle");
  });

  it("pref keys are never locked", () => {
    expect(rowState("prefAgeMin", stored, {}, ["city"])).toBe("idle");
    expect(rowState("prefAgeMin", stored, {}, ["prefAgeMin"])).toBe("idle");
    expect(rowState("prefAgeMin", stored, { prefAgeMin: 25 }, ["city"])).toBe("fill");
  });
});

describe("planSave", () => {
  it("puts empty-field changes in fillBody built by buildFillBody and stored-value changes in reviewChanges", () => {
    const plan = planSave({ fieldOfStudy: "هندسة", city: "إربد", prefCity: ["إربد"] }, stored);
    expect(plan.fillKeys).toEqual(["fieldOfStudy"]);
    expect(plan.fillBody).toMatchObject({
      dateOfBirth: "1995-01-15", city: "عمّان", nationality: "أردني", education: "بكالوريوس",
      maritalStatus: "أعزب/عزباء", religiosity: "ملتزم", prefAgeMin: 22, prefAgeMax: 30, fieldOfStudy: "هندسة",
    });
    expect(plan.reviewKeys).toEqual(["city"]);
    expect(plan.reviewChanges).toEqual({ city: "إربد" });
    expect(plan.prefChanges).toEqual({ prefCity: ["إربد"] });
    expect(plan.dealbreakerKeys).toBeNull();
  });

  it("drops changes equal to the stored value and returns nulls for nothing to send", () => {
    const plan = planSave({ city: "عمّان", height: "175" }, stored);
    expect(plan).toEqual({ prefChanges: null, dealbreakerKeys: null, fillBody: null, reviewChanges: null, fillKeys: [], reviewKeys: [] });
  });

  it("keeps the stored age range in the planned fill body", () => {
    const plan = planSave({ prefAgeMin: 25, hobbies: "القراءة" }, stored);
    expect(plan.fillBody).toMatchObject({ prefAgeMin: 22, prefAgeMax: 30, hobbies: "القراءة" });
  });

  it("sends the dealbreakers only when they changed", () => {
    expect(planSave({}, stored, { stored: ["age", "city"], next: ["city", "age"] }).dealbreakerKeys).toBeNull();
    expect(planSave({}, stored, { stored: ["age"], next: ["age", "city"] }).dealbreakerKeys).toEqual(["age", "city"]);
  });

  it("lets the review carry the fills when the stored profile lacks a basic", () => {
    const plan = planSave({ fieldOfStudy: "طب" }, { ...stored, education: null });
    expect(plan.fillBody).toBeNull();
    expect(plan.fillKeys).toEqual([]);
    expect(plan.reviewChanges).toEqual({ fieldOfStudy: "طب" });
    expect(plan.reviewKeys).toEqual(["fieldOfStudy"]);
  });
});

describe("runSave", () => {
  it("keeps saved fills when the review POST fails", async () => {
    const plan = planSave({ fieldOfStudy: "هندسة", city: "إربد" }, stored);
    const a = api({ postReview: async () => json(500, { error: "خطأ" }) });
    const r = await runSave(plan, a);
    expect(r.saved).toEqual(["fieldOfStudy"]);
    expect(r.failed).toEqual(["city"]);
    expect(r.sentForReview).toEqual([]);
    expect(r.error).toBe("خطأ");
  });

  it("maps 409 REQUEST_PENDING", async () => {
    const plan = planSave({ city: "إربد" }, stored);
    const a = api({ postReview: async () => json(409, { error: "لديك طلب تعديل قيد المراجعة بالفعل. اسحبه أولاً أو انتظر مراجعته.", code: "REQUEST_PENDING" }) });
    const r = await runSave(plan, a);
    expect(r.error).toBe("لديك طلب تعديل قيد المراجعة بالفعل.");
    expect(r.failed).toEqual(["city"]);
  });

  it("sends preferences in their own POST before the review POST, so they save while a request is pending", async () => {
    const order: string[] = [];
    const a = api({
      postPrefs: async () => { order.push("prefs"); return json(200); },
      putDealbreakers: async () => { order.push("dealbreakers"); return json(200); },
      putProfile: async () => { order.push("fills"); return json(200); },
      postReview: async () => { order.push("review"); return json(409, { code: "REQUEST_PENDING" }); },
    });
    const plan = planSave({ prefCity: ["إربد"], fieldOfStudy: "طب", city: "إربد" }, stored, { stored: [], next: ["city"] });
    const r = await runSave(plan, a, "ملاحظة");
    expect(order).toEqual(["prefs", "dealbreakers", "fills", "review"]);
    expect(a.postPrefs).toHaveBeenCalledWith({ prefCity: ["إربد"] });
    expect(a.putDealbreakers).toHaveBeenCalledWith(["city"]);
    expect(a.postReview).toHaveBeenCalledWith({ city: "إربد" }, "ملاحظة");
    expect(r.saved).toEqual(["prefCity", DEALBREAKERS_KEY, "fieldOfStudy"]);
    expect(r.failed).toEqual(["city"]);
  });

  it("sends the fill PUT with the new age range once the preferences saved", async () => {
    const a = api();
    const r = await runSave(planSave({ prefAgeMin: 25, hobbies: "القراءة" }, stored), a);
    expect(a.putProfile).toHaveBeenCalledWith(expect.objectContaining({ prefAgeMin: 25, prefAgeMax: 30, hobbies: "القراءة" }));
    expect(r.saved).toEqual(["prefAgeMin", "hobbies"]);
  });

  it("prefs POST fails → fill PUT body carries the stored age range and prefAgeMin is in failed", async () => {
    const a = api({ postPrefs: async () => json(500, { error: "خطأ" }) });
    const r = await runSave(planSave({ prefAgeMin: 25, hobbies: "القراءة" }, stored), a);
    expect(a.putProfile).toHaveBeenCalledWith(expect.objectContaining({ prefAgeMin: 22, prefAgeMax: 30, hobbies: "القراءة" }));
    expect(r.failed).toEqual(["prefAgeMin"]);
    expect(r.saved).toEqual(["hobbies"]);
  });

  it("reports everything sent for review on success", async () => {
    const r = await runSave(planSave({ aboutMe: "جديدة" }, stored), api());
    expect(r).toEqual({ saved: [], sentForReview: ["aboutMe"], failed: [] });
  });

  it("counts a network failure as failed", async () => {
    const a = api({ putProfile: async () => { throw new TypeError("offline"); } });
    const r = await runSave(planSave({ fieldOfStudy: "طب" }, stored), a);
    expect(r.failed).toEqual(["fieldOfStudy"]);
    expect(r.error).toBeTruthy();
  });

  it("skips calls with nothing to send", async () => {
    const a = api();
    await runSave(planSave({}, stored), a);
    expect(a.postPrefs).not.toHaveBeenCalled();
    expect(a.putDealbreakers).not.toHaveBeenCalled();
    expect(a.putProfile).not.toHaveBeenCalled();
    expect(a.postReview).not.toHaveBeenCalled();
  });
});

describe("saveSummary", () => {
  it("one saved field plus one review field", () => {
    expect(saveSummary({ saved: ["hobbies"], sentForReview: ["aboutMe"], failed: [] }, labelOf)).toBe(
      "حُفظت الهوايات. نبذتك الجديدة أُرسلت للمراجعة، وستظهر بعد الموافقة.",
    );
  });

  it("agrees with a masculine field and joins several", () => {
    expect(saveSummary({ saved: ["fieldOfStudy"], sentForReview: [], failed: [] }, labelOf)).toBe("حُفظ التخصص.");
    expect(saveSummary({ saved: ["fieldOfStudy", "hobbies", "interests"], sentForReview: [], failed: [] }, labelOf)).toBe(
      "حُفظ التخصص، الهوايات والاهتمامات.",
    );
    expect(saveSummary({ saved: [], sentForReview: ["height"], failed: [] }, labelOf)).toBe(
      "الطول الجديد أُرسل للمراجعة، وسيظهر بعد الموافقة.",
    );
    expect(saveSummary({ saved: [], sentForReview: ["city", "height"], failed: [] }, labelOf)).toBe(
      "تعديلاتك على المدينة والطول أُرسلت للمراجعة، وستظهر بعد الموافقة.",
    );
  });

  it("names hijab once and the «شروط أساسية» by name", () => {
    expect(saveSummary({ saved: ["hijab", "niqab", DEALBREAKERS_KEY], sentForReview: [], failed: [] }, labelOf)).toBe(
      "حُفظ الحجاب والشروط الأساسية.",
    );
  });

  it("names what failed and the reason", () => {
    expect(saveSummary({ saved: ["hobbies"], sentForReview: [], failed: ["city"], error: "لديك طلب تعديل قيد المراجعة بالفعل." }, labelOf)).toBe(
      "حُفظت الهوايات. لم يُحفظ تعديل المدينة: لديك طلب تعديل قيد المراجعة بالفعل.",
    );
  });
});
