import { z } from "zod/v4";

export const createTicketSchema = z.object({
  type: z.enum(["ISSUE", "SUGGESTION", "CHANGE_REQUEST"]),
  subject: z
    .string()
    .min(5, "الموضوع يجب أن يكون 5 أحرف على الأقل")
    .max(200, "الموضوع يجب أن لا يتجاوز 200 حرف"),
  description: z
    .string()
    .min(20, "الوصف يجب أن يكون 20 حرف على الأقل")
    .max(2000, "الوصف يجب أن لا يتجاوز 2000 حرف"),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
