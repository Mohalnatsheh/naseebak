import { z } from "zod/v4";
import { COUNTRY_CODES } from "@/lib/countries";
import { POLL_NOTE_MAX, POLL_OPTION_MAX, POLL_OPTIONS_MAX, POLL_OPTIONS_MIN, POLL_QUESTION_MAX } from "@/lib/engagement/poll-types";

const text = (max: number, label: string) =>
  z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1, `${label} is required`).max(max, `${label}: at most ${max} characters`));

/** Admin: create or edit a weekly question (options are labels; ids are given by the server) */
export const pollInputSchema = z.object({
  question: text(POLL_QUESTION_MAX, "Question"),
  /** Whose question it is; set when created (Jordan when not sent) */
  country: z.enum(COUNTRY_CODES).optional(),
  options: z
    .array(text(POLL_OPTION_MAX, "Option"))
    .min(POLL_OPTIONS_MIN, `At least ${POLL_OPTIONS_MIN} options`)
    .max(POLL_OPTIONS_MAX, `At most ${POLL_OPTIONS_MAX} options`)
    .refine((o) => new Set(o).size === o.length, "Options must be different"),
  note: z
    .string()
    .max(POLL_NOTE_MAX, `Note: at most ${POLL_NOTE_MAX} characters`)
    .transform((s) => s.trim() || null)
    .nullable()
    .optional(),
});
