import { z } from "zod/v4";

export const updateNotificationPreferencesSchema = z.object({
  suggestions: z.boolean().optional(),
  interests: z.boolean().optional(),
  matches: z.boolean().optional(),
  visitUpdates: z.boolean().optional(),
  payments: z.boolean().optional(),
  identity: z.boolean().optional(),
  support: z.boolean().optional(),
});
