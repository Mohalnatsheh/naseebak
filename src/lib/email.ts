/**
 * SMTP email (Hostinger). Lazy-init transporter, same pattern as src/lib/stripe.ts.
 */
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface NewUserInfo {
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  createdAt: Date;
}

/** Notify the admin inbox (ADMIN_NOTIFY_EMAIL) that a new user registered. */
export async function sendNewUserNotification(user: NewUserInfo): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  const smtp = getTransporter();
  if (!to || !smtp) {
    console.warn("[Email] SMTP or ADMIN_NOTIFY_EMAIL not configured — skipping new user notification");
    return;
  }

  const fullName = `${user.firstName} ${user.lastName}`;
  const phone = `+${user.phone}`;
  const gender = user.gender === "MALE" ? "ذكر" : "أنثى";
  const date = user.createdAt.toLocaleString("ar-JO-u-nu-latn", { timeZone: "Asia/Amman" });

  await smtp.sendMail({
    from: process.env.SMTP_FROM || `"نصيبك Naseebak" <${process.env.SMTP_USER}>`,
    to,
    subject: `مستخدم جديد: ${fullName}`,
    text: `تسجيل مستخدم جديد في نصيبك\n\nالاسم: ${fullName}\nرقم الهاتف: ${phone}\nالجنس: ${gender}\nتاريخ التسجيل: ${date}`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#1f2937">
  <h2 style="color:#22476a;margin:0 0 12px">تسجيل مستخدم جديد في نصيبك</h2>
  <table style="border-collapse:collapse">
    <tr><td style="padding:4px 0 4px 16px;color:#6b7280">الاسم</td><td style="padding:4px 0"><b>${escapeHtml(fullName)}</b></td></tr>
    <tr><td style="padding:4px 0 4px 16px;color:#6b7280">رقم الهاتف</td><td style="padding:4px 0" dir="ltr">${escapeHtml(phone)}</td></tr>
    <tr><td style="padding:4px 0 4px 16px;color:#6b7280">الجنس</td><td style="padding:4px 0">${gender}</td></tr>
    <tr><td style="padding:4px 0 4px 16px;color:#6b7280">تاريخ التسجيل</td><td style="padding:4px 0">${escapeHtml(date)}</td></tr>
  </table>
</div>`,
  });
}

interface ContactMessageInfo {
  name: string;
  email: string | null;
  /** 962… */
  phone?: string | null;
  subject: string;
  message: string;
}

/** Tell the admin inbox about a contact-page message (best effort: the message is already saved). */
/** 962791234567 → 0791234567 (how Jordanians write it) */
function phoneForDisplay(phone962: string): string {
  return phone962.startsWith("962") ? `0${phone962.slice(3)}` : phone962;
}

export async function sendContactNotification(msg: ContactMessageInfo): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  const smtp = getTransporter();
  if (!to || !smtp) {
    console.warn("[Email] SMTP or ADMIN_NOTIFY_EMAIL not configured — skipping contact notification");
    return;
  }

  await smtp.sendMail({
    from: process.env.SMTP_FROM || `"نصيبك Naseebak" <${process.env.SMTP_USER}>`,
    to,
    ...(msg.email && { replyTo: msg.email }),
    subject: `رسالة تواصل: ${msg.subject}`,
    text: `رسالة جديدة من صفحة تواصل معنا\n\nالاسم: ${msg.name}\nالبريد: ${msg.email || "—"}\nالهاتف: ${msg.phone ? phoneForDisplay(msg.phone) : "—"}\nالموضوع: ${msg.subject}\n\n${msg.message}`,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#1f2937">
  <h2 style="color:#22476a;margin:0 0 12px">رسالة جديدة من صفحة تواصل معنا</h2>
  <p style="margin:0 0 4px"><b>${escapeHtml(msg.name)}</b> — <span dir="ltr">${escapeHtml([msg.email, msg.phone && phoneForDisplay(msg.phone)].filter(Boolean).join(" · "))}</span></p>
  <p style="margin:0 0 12px;color:#6b7280">${escapeHtml(msg.subject)}</p>
  <p style="white-space:pre-wrap;margin:0">${escapeHtml(msg.message)}</p>
</div>`,
  });
}

/** Plain-text email to the admin inbox (ADMIN_NOTIFY_EMAIL). Returns false when SMTP isn't configured. */
export async function sendAdminEmail(subject: string, text: string): Promise<boolean> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  const smtp = getTransporter();
  if (!to || !smtp) return false;
  await smtp.sendMail({
    from: process.env.SMTP_FROM || `"نصيبك Naseebak" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html: `<div dir="rtl" style="font-family:Arial,sans-serif;color:#1f2937;white-space:pre-wrap">${escapeHtml(text)}</div>`,
  });
  return true;
}
