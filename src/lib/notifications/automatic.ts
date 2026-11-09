/**
 * Every message members get automatically (Admin → Notifications → Automatic messages). This list documents what the
 * code sends: the texts live at their call sites, and src/__tests__/lib/automatic-notifications.test.ts fails when a
 * text here no longer matches the code. Change both together. {package} and {price} are filled per country.
 */
import { toCountry } from "@/lib/countries";
import { packagesFor, formatPrice, type PackagePrices } from "@/lib/payments/packages";

export type AutomaticChannel = "bell" | "push" | "sms" | "whatsapp";

export interface AutomaticText {
  variant: string;
  title: string;
  body: string;
}

export interface AutomaticNotification {
  key: string;
  group: string;
  when: string;
  who: string;
  channels: AutomaticChannel[];
  texts: AutomaticText[];
  /** Saudi numbers get this code by WhatsApp through a template kept at VerifyWay */
  whatsappInSaudi?: boolean;
}

export const AUTOMATIC_GROUPS: Record<string, string> = {
  suggestions: "Suggestions",
  matches: "Matches and family introductions",
  intro: "Family and chat requests",
  chat: "Chats",
  payments: "Payments",
  credits: "Credits",
  account: "Account",
  moderation: "Reports and moderation",
  engagement: "Bringing members back",
  support: "Support",
  pro: "Pro membership",
};

export const AUTOMATIC_NOTIFICATIONS: AutomaticNotification[] = [
  {
    "key": "suggestions-new-for-me",
    "group": "suggestions",
    "when": "An auto-suggest run creates or reveals cards for the member it ran for; at most one such notice per Amman day.",
    "who": "The member the run was for",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "count 1",
        "title": "اقتراحات توافق جديدة",
        "body": "وصلك اقتراح توافق جديد. يمكنك الاطلاع عليه الآن."
      },
      {
        "variant": "count 2",
        "title": "اقتراحات توافق جديدة",
        "body": "وصلك اقتراحا توافق جديدان. يمكنك الاطلاع عليها الآن."
      },
      {
        "variant": "count 3-10",
        "title": "اقتراحات توافق جديدة",
        "body": "وصلك {العدد} اقتراحات توافق جديدة. يمكنك الاطلاع عليها الآن."
      },
      {
        "variant": "count 11+",
        "title": "اقتراحات توافق جديدة",
        "body": "وصلك {العدد} اقتراح توافق جديد. يمكنك الاطلاع عليها الآن."
      }
    ]
  },
  {
    "key": "suggestions-new-candidate",
    "group": "suggestions",
    "when": "A run for another member creates a visible shared card with this person; at most one such notice per Amman day.",
    "who": "The other person on each new visible card",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "اقتراح توافق جديد",
        "body": "وصلك اقتراح توافق جديد. يمكنك الاطلاع عليه الآن."
      }
    ]
  },
  {
    "key": "suggestions-admin-pick",
    "group": "suggestions",
    "when": "An admin creates a hand-picked suggestion for a pair.",
    "who": "Both people when shared suggestions are on (recipient only otherwise)",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "اقتراح جديد من الإدارة",
        "body": "لديك اقتراح توافق جديد من فريق نصيبك. يمكنك الاطلاع عليه الآن."
      }
    ]
  },
  {
    "key": "suggestions-interest-shown",
    "group": "suggestions",
    "when": "Someone says «مهتم» on a card this person has not answered (or a hidden card is revealed to them); at most once per Amman day.",
    "who": "The undecided person on the card",
    "channels": [
      "bell",
      "push",
      "sms"
    ],
    "texts": [
      {
        "variant": "female",
        "title": "شخص أبدى اهتمامه بك",
        "body": "وصلكِ اقتراح توافق من شخص مهتم بكِ. اطّلعي عليه وقرّري قبل أن تنتهي مدته."
      },
      {
        "variant": "male",
        "title": "شخص أبدى اهتمامه بك",
        "body": "وصلك اقتراح توافق من شخص مهتم بك. اطّلع عليه وقرّر قبل أن تنتهي مدته."
      },
      {
        "variant": "female, credits 0",
        "title": "شخص أبدى اهتمامه بك",
        "body": "وصلكِ اقتراح توافق من شخص مهتم بكِ. اطّلعي عليه وقرّري قبل أن تنتهي مدته. رصيدكِ صفر: اشحني {package} بـ {price} لتردّي."
      },
      {
        "variant": "male, credits 0",
        "title": "شخص أبدى اهتمامه بك",
        "body": "وصلك اقتراح توافق من شخص مهتم بك. اطّلع عليه وقرّر قبل أن تنتهي مدته. رصيدك صفر: اشحن {package} بـ {price} لتردّ."
      },
      {
        "variant": "female, free reply on",
        "title": "شخص أبدى اهتمامه بك",
        "body": "وصلكِ اقتراح توافق من شخص مهتم بكِ. اطّلعي عليه وقرّري قبل أن تنتهي مدته. الرد بـ«مهتم» مجاني."
      },
      {
        "variant": "male, free reply on",
        "title": "شخص أبدى اهتمامه بك",
        "body": "وصلك اقتراح توافق من شخص مهتم بك. اطّلع عليه وقرّر قبل أن تنتهي مدته. الرد بـ«مهتم» مجاني."
      }
    ]
  },
  {
    "key": "suggestions-expiring",
    "group": "suggestions",
    "when": "Daily evening job, once per card, when 2 days or less remain and this person has not decided.",
    "who": "Each undecided side of the card",
    "channels": [
      "bell",
      "push",
      "sms"
    ],
    "texts": [
      {
        "variant": "female",
        "title": "اقتراح بانتظار قرارك",
        "body": "بقي يومان أو أقل على انتهاء اقتراح توافق لم تقرّري فيه بعد. اطّلعي عليه الآن."
      },
      {
        "variant": "male",
        "title": "اقتراح بانتظار قرارك",
        "body": "بقي يومان أو أقل على انتهاء اقتراح توافق لم تقرّر فيه بعد. اطّلع عليه الآن."
      }
    ]
  },
  {
    "key": "suggestions-liked-waiting",
    "group": "suggestions",
    "when": "Evening job: a member away 2+ days (seen within 30) has an open card where the other said «مهتم»; at most once per 2 days.",
    "who": "The away member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "female",
        "title": "شخص ينتظر ردّك",
        "body": "أحدهم قال «مهتم» لكِ وما زال ينتظر قراركِ. ادخلي وشاهدي الاقتراح قبل انتهاء مدته."
      },
      {
        "variant": "male",
        "title": "شخص ينتظر ردّك",
        "body": "أحدهم قال «مهتم» لك وما زال ينتظر قرارك. ادخل وشاهد الاقتراح قبل انتهاء مدته."
      },
      {
        "variant": "female, credits 0",
        "title": "شخص ينتظر ردّك",
        "body": "أحدهم قال «مهتم» لكِ وما زال ينتظر قراركِ. ادخلي وشاهدي الاقتراح قبل انتهاء مدته. رصيدكِ صفر: اشحني {package} بـ {price} لتردّي."
      },
      {
        "variant": "male, credits 0",
        "title": "شخص ينتظر ردّك",
        "body": "أحدهم قال «مهتم» لك وما زال ينتظر قرارك. ادخل وشاهد الاقتراح قبل انتهاء مدته. رصيدك صفر: اشحن {package} بـ {price} لتردّ."
      },
      {
        "variant": "female, free reply on",
        "title": "شخص ينتظر ردّك",
        "body": "أحدهم قال «مهتم» لكِ وما زال ينتظر قراركِ. ادخلي وشاهدي الاقتراح قبل انتهاء مدته. الرد بـ«مهتم» مجاني."
      },
      {
        "variant": "male, free reply on",
        "title": "شخص ينتظر ردّك",
        "body": "أحدهم قال «مهتم» لك وما زال ينتظر قرارك. ادخل وشاهد الاقتراح قبل انتهاء مدته. الرد بـ«مهتم» مجاني."
      }
    ]
  },
  {
    "key": "sms-interest",
    "group": "suggestions",
    "when": "SMS fallback for «شخص أبدى اهتمامه بك», for a member with no push device seen in the last 14 days; at most one notice SMS per Amman day, held overnight. Only while sms_notices_enabled is on.",
    "who": "The undecided member without push",
    "channels": [
      "sms"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "",
        "body": "نصيبك: شخص أبدى اهتمامه بك. naseebak.com/dashboard/suggestions"
      }
    ]
  },
  {
    "key": "sms-expiring",
    "group": "suggestions",
    "when": "Not sent automatically since 2026-11-07 (SMS go only for a match or a «مهتم»). Text kept for an admin «send now».",
    "who": "The undecided member without push",
    "channels": [
      "sms"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "",
        "body": "نصيبك: اقتراح ينتهي خلال يومين. naseebak.com/dashboard/suggestions"
      }
    ]
  },
  {
    "key": "match-chat-open",
    "group": "matches",
    "when": "A mutual match opens and both chose chat, so the chat opens at once.",
    "who": "Both people",
    "channels": [
      "bell",
      "push",
      "sms"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "توافق متبادل!",
        "body": "توافق متبادل! المحادثة مفتوحة الآن"
      }
    ]
  },
  {
    "key": "match-family",
    "group": "matches",
    "when": "A mutual match opens as a family introduction (both chose family, or a mixed choice).",
    "who": "Both people, each with their own wording",
    "channels": [
      "bell",
      "push",
      "sms"
    ],
    "texts": [
      {
        "variant": "both chose family",
        "title": "توافق متبادل!",
        "body": "توافق متبادل! تم مشاركة بيانات التواصل العائلي"
      },
      {
        "variant": "mixed, this person chose chat",
        "title": "توافق متبادل!",
        "body": "توافق متبادل! الطرف الآخر فضّل التعارف العائلي. يمكنك مشاركة بيانات وليّ أمرك من صفحة التوافق لتتبادل العائلتان بيانات التواصل"
      },
      {
        "variant": "mixed, this person chose family",
        "title": "توافق متبادل!",
        "body": "توافق متبادل! فضّل الطرف الآخر المحادثة أولاً، وطلبنا منه مشاركة بيانات وليّ أمره. سنُعلمك فور مشاركتها"
      }
    ]
  },
  {
    "key": "match-no-intro-choice",
    "group": "matches",
    "when": "A mutual match opens with no stored intro choice, or the intro outcome failed.",
    "who": "Both people",
    "channels": [
      "bell",
      "push",
      "sms"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "توافق متبادل!",
        "body": "تهانينا! لديك توافق متبادل جديد. يمكنك الآن إرسال طلب تعارف عائلي أو طلب محادثة."
      }
    ]
  },
  {
    "key": "match-guardian-shared",
    "group": "matches",
    "when": "The side that chose chat on a mixed match shares their guardian contact.",
    "who": "The partner who chose family",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تمت مشاركة بيانات وليّ الأمر",
        "body": "شارك الطرف الآخر بيانات وليّ أمره، وتبادلت العائلتان بيانات التواصل. يمكنكما الآن ترتيب الزيارة العائلية."
      }
    ]
  },
  {
    "key": "match-guardian-share-reminder",
    "group": "matches",
    "when": "Daily job, once, 2 days after a mixed-choice match if the chat-chooser still has not shared.",
    "who": "The side that has not shared",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "بانتظار مشاركة بيانات وليّ أمرك",
        "body": "الطرف الآخر فضّل التعارف العائلي وينتظر مشاركتك لتتبادل العائلتان بيانات التواصل. يمكنك المشاركة أو إنهاء التعارف من صفحة التوافق."
      }
    ]
  },
  {
    "key": "match-guardian-share-last-call",
    "group": "matches",
    "when": "Evening job, once, 5 days after a mixed-choice match if the chat-chooser still has not shared.",
    "who": "The side that has not shared",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "آخر فرصة لهذا التوافق",
        "body": "الطرف الآخر ما زال ينتظر مشاركة بيانات وليّ أمرك. إذا لم تتم المشاركة خلال يومين سيُغلق هذا التوافق."
      }
    ]
  },
  {
    "key": "match-guardian-share-closed",
    "group": "matches",
    "when": "Evening job, 2 days after the last call, when the mixed-choice match closes.",
    "who": "Both people",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "the side that was waiting",
        "title": "انتهى هذا التوافق",
        "body": "لم يشارك الطرف الآخر بيانات وليّ أمره خلال المدة، فأغلقنا هذا التوافق. نتمنى لك التوفيق في اقتراحاتك القادمة."
      },
      {
        "variant": "the side that did not share",
        "title": "انتهى هذا التوافق",
        "body": "انتهت مدة مشاركة بيانات وليّ أمرك، فأغلقنا هذا التوافق."
      }
    ]
  },
  {
    "key": "match-guardian-consent-withdrawn",
    "group": "matches",
    "when": "A member withdraws guardian-sharing consent while they have accepted family introductions.",
    "who": "Partners on those matches",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تغيّرت بيانات التواصل العائلي",
        "body": "أوقف الطرف الآخر مشاركة بيانات وليّ أمره، فلم تعد ظاهرة في صفحة التوافق."
      }
    ]
  },
  {
    "key": "match-family-followup",
    "group": "matches",
    "when": "Daily job, 7 days after a family introduction, then every 14 days, at most 3 times.",
    "who": "Each side that has not answered or is still CONTINUING",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "كيف يسير التعارف العائلي؟",
        "body": "أخبرنا بما وصلتم إليه: ما زلنا نتعارف، تمت الخطبة، أو لم يُكتب نصيب."
      }
    ]
  },
  {
    "key": "match-ended-not-a-match",
    "group": "matches",
    "when": "One side reports «لم يحصل نصيب», which closes the match.",
    "who": "The partner",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهى التعارف",
        "body": "أخبرنا الطرف الآخر أنه لم يُكتب نصيب في هذا التعارف. نتمنى لك التوفيق في اقتراحاتك القادمة."
      }
    ]
  },
  {
    "key": "match-engaged-confirm",
    "group": "matches",
    "when": "One side reports «تمت الخطبة» and the partner has not confirmed yet.",
    "who": "The partner",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "مبارك! 🎉",
        "body": "أخبرنا الطرف الآخر أن التعارف انتهى بالخطبة. يمكنك تأكيد ذلك من صفحة التوافق لنتوقف عن إرسال الاقتراحات."
      }
    ]
  },
  {
    "key": "match-closed-partner-engaged",
    "group": "matches",
    "when": "A member gets engaged on one match, which closes their other open matches.",
    "who": "The partner on each closed match",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهى أحد التوافقات",
        "body": "لم يعد الطرف الآخر متاحاً لهذا التوافق. نتمنى لك التوفيق في اقتراحاتك القادمة."
      }
    ]
  },
  {
    "key": "match-partner-deleted",
    "group": "matches",
    "when": "A member deletes their account while a match is still open, unless the pair blocked each other.",
    "who": "Partners on open matches",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهى أحد التوافقات",
        "body": "حذف الطرف الآخر حسابه، فانتهى التوافق بينكما. نتمنى لك التوفيق في اقتراحاتك القادمة."
      }
    ]
  },
  {
    "key": "sms-match",
    "group": "matches",
    "when": "SMS fallback for any «توافق متبادل!» notice, for a member with no push device seen in the last 14 days; at most one notice SMS per Amman day, held overnight. Only while sms_notices_enabled is on.",
    "who": "The matched member without push",
    "channels": [
      "sms"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "",
        "body": "نصيبك: لديك توافق متبادل جديد! naseebak.com/dashboard/matches"
      }
    ]
  },
  {
    "key": "intro-request-new",
    "group": "intro",
    "when": "A member sends a family or chat request on a match.",
    "who": "The request's receiver",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "family",
        "title": "طلب تعارف عائلي جديد",
        "body": "وصلك طلب تعارف عائلي من {الاسم}. عند القبول تتبادل العائلتان بيانات التواصل."
      },
      {
        "variant": "chat",
        "title": "طلب محادثة جديد",
        "body": "وصلك طلب محادثة من {الاسم} للتعارف قبل الزيارة العائلية."
      }
    ]
  },
  {
    "key": "intro-request-declined",
    "group": "intro",
    "when": "The receiver declines a request.",
    "who": "The request's sender",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "family",
        "title": "لم يتم قبول الطلب حالياً",
        "body": "لم يتم قبول طلب التعارف العائلي. نتمنى لك التوفيق في اقتراحاتك القادمة."
      },
      {
        "variant": "family, the chat between them still open",
        "title": "لم يتم قبول الطلب حالياً",
        "body": "لم يتم قبول طلب التعارف العائلي، والمحادثة بينكما ما زالت مفتوحة."
      },
      {
        "variant": "chat, the family introduction already agreed",
        "title": "لم يتم قبول الطلب حالياً",
        "body": "لم يتم قبول طلب المحادثة، ويبقى التعارف العائلي بينكما قائماً."
      },
      {
        "variant": "chat, the match still open",
        "title": "لم يتم قبول الطلب حالياً",
        "body": "لم يتم قبول طلب المحادثة، والتوافق بينكما ما زال قائماً. يمكنك طلب التعارف العائلي من صفحة التوافق."
      },
      {
        "variant": "chat, the family request declined too",
        "title": "لم يتم قبول الطلب حالياً",
        "body": "لم يتم قبول طلب المحادثة. نتمنى لك التوفيق في اقتراحاتك القادمة."
      }
    ]
  },
  {
    "key": "intro-request-accepted",
    "group": "intro",
    "when": "The receiver accepts a request.",
    "who": "The request's sender",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "family",
        "title": "تم قبول طلبك",
        "body": "تم قبول طلب التعارف العائلي. يمكنك الآن رؤية بيانات وليّ الأمر للطرف الآخر."
      },
      {
        "variant": "chat",
        "title": "تم قبول طلبك",
        "body": "تم قبول طلب المحادثة. يمكنكما الآن التعارف داخل نصيبك لمدة 14 يوماً."
      }
    ]
  },
  {
    "key": "intro-request-withdrawn",
    "group": "intro",
    "when": "The sender withdraws a pending request.",
    "who": "The request's receiver",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "family",
        "title": "أُلغي طلب التعارف العائلي",
        "body": "سحب الطرف الآخر طلبه قبل الرد عليه. ما زال التوافق قائماً ويمكنكما إرسال طلب جديد لاحقاً."
      },
      {
        "variant": "chat",
        "title": "أُلغي طلب المحادثة",
        "body": "سحب الطرف الآخر طلبه قبل الرد عليه. ما زال التوافق قائماً ويمكنكما إرسال طلب جديد لاحقاً."
      }
    ]
  },
  {
    "key": "intro-request-expired",
    "group": "intro",
    "when": "Daily job: a pending request ran past its 7 days with no reply.",
    "who": "The request's sender",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "family",
        "title": "انتهت مدة طلبك دون رد",
        "body": "مرّت 7 أيام على طلب التعارف العائلي دون رد من الطرف الآخر، وانتهت مدته. يمكنك إرساله مرة أخرى من صفحة التوافق."
      },
      {
        "variant": "chat",
        "title": "انتهت مدة طلبك دون رد",
        "body": "مرّت 7 أيام على طلب المحادثة دون رد من الطرف الآخر، وانتهت مدته. يمكنك إرساله مرة أخرى من صفحة التوافق."
      }
    ]
  },
  {
    "key": "intro-request-reminder",
    "group": "intro",
    "when": "Daily job, once, when a pending request has 2 days or less left.",
    "who": "The request's receiver",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "female, family",
        "title": "لديك طلب تعارف ينتهي خلال يومين",
        "body": "ردّي على طلب التعارف العائلي قبل انتهاء مدته."
      },
      {
        "variant": "female, chat",
        "title": "لديك طلب تعارف ينتهي خلال يومين",
        "body": "ردّي على طلب المحادثة قبل انتهاء مدته."
      },
      {
        "variant": "male, family",
        "title": "لديك طلب تعارف ينتهي خلال يومين",
        "body": "ردّ على طلب التعارف العائلي قبل انتهاء مدته."
      },
      {
        "variant": "male, chat",
        "title": "لديك طلب تعارف ينتهي خلال يومين",
        "body": "ردّ على طلب المحادثة قبل انتهاء مدته."
      }
    ]
  },
  {
    "key": "intro-request-cancelled-inactive",
    "group": "intro",
    "when": "A member leaves (deactivated or suspended, not deleted) with pending requests; once per match.",
    "who": "The other person on the request",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "family, recipient sent it",
        "title": "أُلغي طلب التعارف العائلي",
        "body": "أُلغي طلبك لأن حساب الطرف الآخر لم يعد نشطاً. نتمنى لك التوفيق في اقتراحاتك القادمة."
      },
      {
        "variant": "family, recipient received it",
        "title": "أُلغي طلب التعارف العائلي",
        "body": "أُلغي الطلب لأن حساب الطرف الآخر لم يعد نشطاً. نتمنى لك التوفيق في اقتراحاتك القادمة."
      },
      {
        "variant": "chat, recipient sent it",
        "title": "أُلغي طلب المحادثة",
        "body": "أُلغي طلبك لأن حساب الطرف الآخر لم يعد نشطاً. نتمنى لك التوفيق في اقتراحاتك القادمة."
      },
      {
        "variant": "chat, recipient received it",
        "title": "أُلغي طلب المحادثة",
        "body": "أُلغي الطلب لأن حساب الطرف الآخر لم يعد نشطاً. نتمنى لك التوفيق في اقتراحاتك القادمة."
      }
    ]
  },
  {
    "key": "chat-message-push",
    "group": "chat",
    "when": "A partner sends a chat message; at most one push per chat every 3 minutes.",
    "who": "The message's recipient",
    "channels": [
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "نصيبك",
        "body": "رسالة جديدة من {الاسم}"
      }
    ]
  },
  {
    "key": "chat-unread-bell",
    "group": "chat",
    "when": "A partner sends a message; one unread bell entry per chat is created or rewritten with the count.",
    "who": "The message's recipient",
    "channels": [
      "bell"
    ],
    "texts": [
      {
        "variant": "1 message",
        "title": "رسائل جديدة",
        "body": "لديك رسالة جديدة من {الاسم}"
      },
      {
        "variant": "2 messages",
        "title": "رسائل جديدة",
        "body": "لديك رسالتان جديدتان من {الاسم}"
      },
      {
        "variant": "3-10 messages",
        "title": "رسائل جديدة",
        "body": "لديك {العدد} رسائل جديدة من {الاسم}"
      },
      {
        "variant": "11+ messages",
        "title": "رسائل جديدة",
        "body": "لديك {العدد} رسالة جديدة من {الاسم}"
      }
    ]
  },
  {
    "key": "chat-expired",
    "group": "chat",
    "when": "A chat's time runs out while the free move to family is still open.",
    "who": "Both people",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهت مدة المحادثة",
        "body": "هل تنتقلان لتعارف عائلي؟ الانتقال مجاني حتى {التاريخ}، وتتبادل العائلتان بيانات وليّ الأمر لترتيب الزيارة."
      }
    ]
  },
  {
    "key": "chat-family-nudge",
    "group": "chat",
    "when": "Once, 7 to 9 days after a chat opens, if the family path is still open.",
    "who": "Both people",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "أسبوع على محادثتكما",
        "body": "إن شعرتما بالارتياح يمكنكما الانتقال لتعارف عائلي الآن، والانتقال مجاني."
      }
    ]
  },
  {
    "key": "chat-quiet-nudge",
    "group": "chat",
    "when": "Evening job, once, 2 to 7 days after a chat opens, if nobody wrote or one person's message is still unread.",
    "who": "Both people if nobody wrote; otherwise the person who hasn't read the message",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "nobody wrote",
        "title": "محادثتك لم تبدأ بعد",
        "body": "فُتحت محادثتك قبل يومين ولم يكتب فيها أحد بعد، ومدتها محدودة."
      },
      {
        "variant": "a message is unread",
        "title": "رسالة بانتظار ردك",
        "body": "لديك رسالة لم تُقرأ في محادثتك، ومدة المحادثة محدودة."
      }
    ]
  },
  {
    "key": "chat-ending-soon",
    "group": "chat",
    "when": "Once when a chat has less than 2 days left and both can still talk.",
    "who": "Both people",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "not extended yet",
        "title": "تنتهي المحادثة قريباً",
        "body": "بقي يومان على انتهاء المحادثة. يمكنكما التمديد مرة واحدة أو الانتقال لتعارف عائلي."
      },
      {
        "variant": "already extended",
        "title": "تنتهي المحادثة قريباً",
        "body": "بقي يومان على انتهاء المحادثة. يمكنكما الانتقال لتعارف عائلي."
      }
    ]
  },
  {
    "key": "chat-extended",
    "group": "chat",
    "when": "One member extends the chat by 7 days.",
    "who": "The partner",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تم تمديد المحادثة",
        "body": "تم تمديد المحادثة 7 أيام إضافية."
      }
    ]
  },
  {
    "key": "chat-ended-by-partner",
    "group": "chat",
    "when": "A member ends an open chat.",
    "who": "The partner",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهت المحادثة",
        "body": "أنهى الطرف الآخر المحادثة. نتمنى لك التوفيق في اقتراحاتك القادمة."
      }
    ]
  },
  {
    "key": "chat-ended-inactive",
    "group": "chat",
    "when": "A member leaves (deactivated or suspended, not deleted) while in an open chat.",
    "who": "The partner",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهت المحادثة",
        "body": "انتهت المحادثة لأن حساب الطرف الآخر لم يعد نشطاً. نتمنى لك التوفيق في اقتراحاتك القادمة."
      }
    ]
  },
  {
    "key": "sms-chat-message",
    "group": "chat",
    "when": "Admin «send now» only since 2026-11-07: the 15-minute job no longer sends chat SMS (SMS go only for a match or a «مهتم»).",
    "who": "The member with the unread message",
    "channels": [
      "sms"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "",
        "body": "نصيبك: لديك رسالة جديدة. naseebak.com/dashboard/chats"
      }
    ]
  },
  {
    "key": "sms-chat-not-started",
    "group": "chat",
    "when": "Admin «send now» only since 2026-11-07: the 15-minute job no longer sends chat SMS (SMS go only for a match or a «مهتم»).",
    "who": "Both members, if they have no push device",
    "channels": [
      "sms"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "",
        "body": "نصيبك: محادثتك مفتوحة ولم تبدأ بعد. naseebak.com/dashboard/chats"
      }
    ]
  },
  {
    "key": "payment-success-checkout",
    "group": "payments",
    "when": "A Stripe Checkout session is paid and credits are added (webhook, return page or daily reconcile).",
    "who": "The buyer",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تم شراء الرصيد بنجاح",
        "body": "تمت إضافة الأرصدة إلى حسابك ({عدد الأرصدة})."
      }
    ]
  },
  {
    "key": "payment-success-intent",
    "group": "payments",
    "when": "A Stripe PaymentIntent from the Arabic payment page succeeds and credits are added.",
    "who": "The buyer",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تم شراء الرصيد بنجاح",
        "body": "تمت إضافة الأرصدة إلى حسابك ({عدد الأرصدة})."
      }
    ]
  },
  {
    "key": "payment-refunded",
    "group": "payments",
    "when": "A payment is refunded (by an admin or a Stripe refund event).",
    "who": "The buyer",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "known package",
        "title": "تم استرداد المبلغ",
        "body": "تم استرداد {المبلغ} (قيمة باقة {package}) إلى بطاقتك، وأُزيل رصيد الباقة من حسابك."
      },
      {
        "variant": "no package",
        "title": "تم استرداد المبلغ",
        "body": "تم استرداد قيمة عملية الدفع إلى بطاقتك."
      }
    ]
  },
  {
    "key": "payment-unpaid-reminder",
    "group": "payments",
    "when": "15-minute job: a payment started 50 minutes to 12 hours ago is still unpaid; once per payment and Amman day, not 23:00-09:00.",
    "who": "The member who started the payment",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "female",
        "title": "باقي خطوة لإتمام شحن رصيدك",
        "body": "اخترتِ باقة ولم يكتمل الدفع. أكملي الدفع في ثوانٍ، والرصيد يعود لكِ تلقائياً إذا لم يردّ الطرف الآخر."
      },
      {
        "variant": "male",
        "title": "باقي خطوة لإتمام شحن رصيدك",
        "body": "اخترت باقة ولم يكتمل الدفع. أكمل الدفع في ثوانٍ، والرصيد يعود لك تلقائياً إذا لم يردّ الطرف الآخر."
      }
    ]
  },
  {
    "key": "credits-exhausted-interest",
    "group": "credits",
    "when": "A member's «مهتم» spends their last credit.",
    "who": "That member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهى رصيدك",
        "body": "انتهى رصيدك. يمكنك الشحن للمتابعة."
      },
      {
        "variant": "test account",
        "title": "انتهى رصيدك",
        "body": "استخدمت كل رصيدك."
      }
    ]
  },
  {
    "key": "credits-interest-refund",
    "group": "credits",
    "when": "The «مهتم» credit comes back because a suggestion closed before the other side answered, or a match was lost at the last moment.",
    "who": "The member who said «مهتم»",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "female",
        "title": "أعدنا لك رصيداً",
        "body": "أُغلق اقتراح أبديتِ اهتمامكِ به قبل أن يكتمل التوافق، فأعدنا لكِ الرصيد."
      },
      {
        "variant": "male",
        "title": "أعدنا لك رصيداً",
        "body": "أُغلق اقتراح أبديت اهتمامك به قبل أن يكتمل التوافق، فأعدنا لك الرصيد."
      }
    ]
  },
  {
    "key": "credits-referral-friend",
    "group": "credits",
    "when": "An invited member completes their profile and earns the referral credit.",
    "who": "The invited member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "مكافأة الدعوة",
        "body": "مبارك! أضفنا إلى حسابك رصيداً لأنك أكملت ملفك الشخصي عبر رمز دعوة."
      }
    ]
  },
  {
    "key": "credits-referral-referrer",
    "group": "credits",
    "when": "A person the member invited completes their profile; capped at the maximum rewarded referrals.",
    "who": "The referrer",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "مكافأة الدعوة",
        "body": "مبارك! أضفنا إلى حسابك رصيدين لأن شخصاً دعوته أكمل ملفه الشخصي."
      }
    ]
  },
  {
    "key": "account-profile-change-reviewed",
    "group": "account",
    "when": "An admin approves or rejects a member's profile change request.",
    "who": "The member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "approved",
        "title": "تمت الموافقة على تعديل ملفك",
        "body": "تمت مراجعة طلب تعديل ملفك الشخصي والموافقة عليه."
      },
      {
        "variant": "approved, with note",
        "title": "تمت الموافقة على تعديل ملفك",
        "body": "تمت مراجعة طلب تعديل ملفك الشخصي والموافقة عليه. ملاحظة الإدارة: {ملاحظة الإدارة}"
      },
      {
        "variant": "rejected",
        "title": "تم رفض تعديل ملفك",
        "body": "تمت مراجعة طلب تعديل ملفك الشخصي ولم تتم الموافقة عليه."
      },
      {
        "variant": "rejected, with note",
        "title": "تم رفض تعديل ملفك",
        "body": "تمت مراجعة طلب تعديل ملفك الشخصي ولم تتم الموافقة عليه. ملاحظة الإدارة: {ملاحظة الإدارة}"
      }
    ]
  },
  {
    "key": "account-identity-reviewed",
    "group": "account",
    "when": "An admin approves or rejects an identity document.",
    "who": "The member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "approved",
        "title": "تم التحقق من هويتك",
        "body": "تهانينا! تم التحقق من هويتك بنجاح وأصبح حسابك يحمل شارة الحساب الموثّق."
      },
      {
        "variant": "rejected",
        "title": "لم يتم التحقق من الحساب",
        "body": "لم يتم منح شارة الحساب الموثّق."
      },
      {
        "variant": "rejected, with reason",
        "title": "لم يتم التحقق من الحساب",
        "body": "لم يتم منح شارة الحساب الموثّق. {السبب}"
      }
    ]
  },
  {
    "key": "account-deletion-cancelled-by-admin",
    "group": "account",
    "when": "An admin cancels a member's account deletion request.",
    "who": "The member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تم إلغاء طلب حذف حسابك",
        "body": "قامت الإدارة بإلغاء طلب حذف حسابك وأُعيد تفعيله. يمكنك متابعة استخدام نصيبك كالمعتاد."
      }
    ]
  },
  {
    "key": "account-reactivated",
    "group": "account",
    "when": "A member reactivates their own deactivated account or cancels their pending deletion.",
    "who": "The member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "pending deletion cancelled",
        "title": "أُعيد تفعيل حسابك",
        "body": "أُلغي طلب حذف حسابك وعاد حسابك مفعّلاً. يسعدنا وجودك معنا من جديد."
      },
      {
        "variant": "deactivated only",
        "title": "أُعيد تفعيل حسابك",
        "body": "عاد حسابك مفعّلاً ويمكنك متابعة رحلتك على نصيبك."
      }
    ]
  },
  {
    "key": "account-otp-code",
    "group": "account",
    "when": "A member asks for a sign-in or sign-up code.",
    "who": "The person entering that phone number",
    "channels": [
      "sms"
    ],
    "texts": [
      {
        "variant": "sms",
        "title": "",
        "body": "رمز التحقق الخاص بك في نصيبك: {الرمز}"
      }
    ],
    "whatsappInSaudi": true
  },
  {
    "key": "moderation-account-suspended",
    "group": "moderation",
    "when": "An admin suspends a member, singly, in bulk or from a report.",
    "who": "The suspended member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تم إيقاف حسابك",
        "body": "تم إيقاف حسابك من قبل الإدارة. يرجى التواصل مع الدعم لمزيد من المعلومات."
      }
    ]
  },
  {
    "key": "moderation-account-unsuspended",
    "group": "moderation",
    "when": "An admin lifts a suspension.",
    "who": "The member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "أُعيد تفعيل حسابك",
        "body": "أُعيد تفعيل حسابك بنجاح. يمكنك الآن استخدام المنصة."
      }
    ]
  },
  {
    "key": "moderation-chat-ended-by-admin",
    "group": "moderation",
    "when": "An admin ends a chat directly or from a report, or suspends one of its members.",
    "who": "Both people, or only the partner when a member is suspended",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهت المحادثة",
        "body": "أنهى فريق نصيبك هذه المحادثة. يمكنك التواصل مع الدعم لمزيد من المعلومات."
      }
    ]
  },
  {
    "key": "moderation-chat-resumed",
    "group": "moderation",
    "when": "An admin reviews a report about a member whose chat was paused under the old automatic rule (before 2026-11-07), and the chat reopens.",
    "who": "Both people in each resumed chat",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "استُؤنفت المحادثة",
        "body": "انتهت المراجعة ويمكنكما متابعة المحادثة."
      }
    ]
  },
  {
    "key": "engagement-win-back",
    "group": "engagement",
    "when": "Evening job, at most once a week, for members away 7 to 30 days with nothing waiting.",
    "who": "Finished profiles, not flagged and not engaged",
    "channels": [
      "push"
    ],
    "texts": [
      {
        "variant": "male",
        "title": "فرص جديدة في نصيبك",
        "body": "افتح حسابك لتصلك اقتراحات جديدة تناسب شروطك."
      },
      {
        "variant": "female",
        "title": "فرص جديدة في نصيبك",
        "body": "افتحي حسابكِ لتصلكِ اقتراحات جديدة تناسب شروطكِ."
      }
    ]
  },
  {
    "key": "engagement-reengagement",
    "group": "engagement",
    "when": "Daily job: a member idle 7 to 30 days has something waiting; at most once per 7 days.",
    "who": "The idle member",
    "channels": [
      "push"
    ],
    "texts": [
      {
        "variant": "1 request",
        "title": "لديك ما ينتظرك في نصيبك",
        "body": "طلب تعارف بانتظار ردك."
      },
      {
        "variant": "several requests",
        "title": "لديك ما ينتظرك في نصيبك",
        "body": "طلبات تعارف بانتظار ردك."
      },
      {
        "variant": "1 suggestion",
        "title": "لديك ما ينتظرك في نصيبك",
        "body": "اقتراح توافق بانتظار قرارك."
      },
      {
        "variant": "several suggestions",
        "title": "لديك ما ينتظرك في نصيبك",
        "body": "اقتراحات توافق بانتظار قرارك."
      },
      {
        "variant": "unread messages",
        "title": "لديك ما ينتظرك في نصيبك",
        "body": "رسائل جديدة في محادثتك."
      }
    ]
  },
  {
    "key": "engagement-filter-tip",
    "group": "engagement",
    "when": "Evening job: an active member has no candidates because of their own dealbreakers, and easing one brings 3+ people; at most once per 7 days.",
    "who": "That member",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "female",
        "title": "شروطك تقلّل اقتراحاتك",
        "body": "لو خففتِ شرط «{الشرط}» يظهر لكِ {عدد الأشخاص}. القرار لكِ، ويمكنكِ تعديل شروطكِ من صفحة التوافقات."
      },
      {
        "variant": "male",
        "title": "شروطك تقلّل اقتراحاتك",
        "body": "لو خففت شرط «{الشرط}» يظهر لك {عدد الأشخاص}. القرار لك، ويمكنك تعديل شروطك من صفحة التوافقات."
      }
    ]
  },
  {
    "key": "support-ticket-update",
    "group": "support",
    "when": "An admin updates a support ticket.",
    "who": "The ticket's owner",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "OPEN",
        "title": "تحديث تذكرة الدعم",
        "body": "تم تحديث حالة تذكرتك \"{عنوان الطلب}\" إلى: مفتوحة"
      },
      {
        "variant": "IN_PROGRESS",
        "title": "تحديث تذكرة الدعم",
        "body": "تم تحديث حالة تذكرتك \"{عنوان الطلب}\" إلى: قيد المعالجة"
      },
      {
        "variant": "RESOLVED",
        "title": "تحديث تذكرة الدعم",
        "body": "تم تحديث حالة تذكرتك \"{عنوان الطلب}\" إلى: تم الحل"
      },
      {
        "variant": "CLOSED",
        "title": "تحديث تذكرة الدعم",
        "body": "تم تحديث حالة تذكرتك \"{عنوان الطلب}\" إلى: مغلقة"
      }
    ]
  },
  {
    "key": "pro-started",
    "group": "pro",
    "when": "A Pro subscription's first payment is confirmed and the membership becomes active.",
    "who": "The subscriber",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "أصبحت عضوية Pro فعّالة",
        "body": "يمكنك الآن إرسال الصور والرسائل الصوتية في المحادثات."
      }
    ]
  },
  {
    "key": "pro-credits",
    "group": "pro",
    "when": "Pro credits are granted: on the first payment, each renewal, and the monthly drip of a yearly plan.",
    "who": "The subscriber",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "count 1",
        "title": "رصيد Pro",
        "body": "أُضيف رصيد واحد إلى رصيدك من اشتراك Pro."
      },
      {
        "variant": "count 2",
        "title": "رصيد Pro",
        "body": "أُضيف رصيدان إلى رصيدك من اشتراك Pro."
      },
      {
        "variant": "count 3-10",
        "title": "رصيد Pro",
        "body": "أُضيف {count} أرصدة إلى رصيدك من اشتراك Pro."
      },
      {
        "variant": "count 11+",
        "title": "رصيد Pro",
        "body": "أُضيف {count} رصيداً إلى رصيدك من اشتراك Pro."
      }
    ]
  },
  {
    "key": "pro-payment-failed",
    "group": "pro",
    "when": "A Pro renewal payment fails at Stripe.",
    "who": "The subscriber",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تعذّر تجديد اشتراك Pro",
        "body": "سنحاول الدفع مرة أخرى خلال الأيام القادمة. إن انتهت العضوية يمكنك الاشتراك من جديد ببطاقة أخرى من صفحة عضوية Pro."
      }
    ]
  },
  {
    "key": "pro-ended",
    "group": "pro",
    "when": "A Pro membership ends: the subscription is cancelled or expires at Stripe, Stripe stops collecting after failed renewals (unpaid or paused), or an admin cancels it now.",
    "who": "The subscriber",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "انتهت عضوية Pro",
        "body": "يمكنك الاشتراك في Pro من جديد في أي وقت من صفحة عضوية Pro."
      }
    ]
  },
  {
    "key": "pro-refund",
    "group": "pro",
    "when": "An admin refunds a Pro payment (Admin → Payments, or in the Stripe dashboard). Refunds are never automatic.",
    "who": "The subscriber",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "default",
        "title": "تم استرداد المبلغ",
        "body": "تم استرداد {amount} من اشتراك Pro إلى بطاقتك، وأُزيل رصيده من حسابك."
      },
      {
        "variant": "no credits taken back",
        "title": "تم استرداد المبلغ",
        "body": "تم استرداد {amount} من اشتراك Pro إلى بطاقتك."
      }
    ]
  },
  {
    "key": "pro-renewal-stopped-on-leave",
    "group": "pro",
    "when": "A member with a live Pro membership pauses the account or asks to delete it: the renewal stops at the period end, with no refund. Reactivating never resumes it on its own.",
    "who": "The subscriber",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "paused",
        "title": "توقّف تجديد Pro",
        "body": "أوقفت حسابك مؤقتاً، فأوقفنا تجديد اشتراك Pro دون استرداد. تبقى مزايا Pro حتى {date}، ويمكنك متابعة الاشتراك من صفحة عضوية Pro بعد إعادة تفعيل حسابك."
      },
      {
        "variant": "deletion requested",
        "title": "توقّف تجديد Pro",
        "body": "طلبت حذف حسابك، فأوقفنا تجديد اشتراك Pro دون استرداد. تبقى مزايا Pro حتى {date} ما لم يُحذف الحساب قبل ذلك."
      }
    ]
  },
  {
    "key": "pro-not-live-payment",
    "group": "pro",
    "when": "A paid Pro invoice did not make Pro live: a second subscription paid while one was live, or a renewal paid after Pro ended. Admins get an email to decide on a refund.",
    "who": "The member who paid",
    "channels": [
      "bell",
      "push"
    ],
    "texts": [
      {
        "variant": "duplicate",
        "title": "دفعة Pro إضافية",
        "body": "وصلتنا دفعة لاشتراك Pro ثانٍ بينما اشتراكك فعّال، فأوقفنا الاشتراك الثاني. سيراجع فريق نصيبك هذه الدفعة ويُعلمك بقرار استردادها."
      },
      {
        "variant": "after the end",
        "title": "دفعة Pro إضافية",
        "body": "وصلتنا دفعة تجديد بعد انتهاء عضوية Pro، ولم تُستأنف العضوية. سيراجع فريق نصيبك هذه الدفعة ويُعلمك بقرار استردادها."
      }
    ]
  }
];

/** The list for one country: its smallest package and price in the top-up lines, and how its codes are delivered */
export function automaticNotificationsFor(country: unknown, prices?: PackagePrices | null): AutomaticNotification[] {
  const code = toCountry(country);
  const smallest = [...packagesFor(code, prices)].sort((a, b) => a.credits - b.credits)[0];
  const fill = (text: string) => text.replaceAll("{package}", smallest.name).replaceAll("{price}", formatPrice(smallest));
  return AUTOMATIC_NOTIFICATIONS.map((n) => ({
    ...n,
    channels: n.whatsappInSaudi && code === "SA" ? ["whatsapp"] : n.channels,
    texts: n.texts.map((t) => ({ ...t, title: fill(t.title), body: fill(t.body) })),
  }));
}
