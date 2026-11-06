import { z } from "zod/v4";

export const applyReferralSchema = z.object({
  code: z.string().length(8, "رمز الدعوة يجب أن يكون 8 أحرف"),
});
