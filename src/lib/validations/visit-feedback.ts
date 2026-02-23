import { z } from "zod/v4";

export const visitFeedbackSchema = z.object({
  outcome: z.enum(["PROCEEDED", "DECLINED"]),
  reason: z.string().max(500).optional(),
  rating: z.number().int().min(1).max(5),
});
