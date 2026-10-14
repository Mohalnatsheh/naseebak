import { z } from "zod/v4";

export const applyReferralSchema = z.object({
  code: z.string().length(8, "رمز الإحالة يجب أن يكون 8 أحرف"),
});
