"use client";

import { useState } from "react";
import Link from "@/components/shared/site-link";
import {
  Mail,
  MapPin,
  Send,
  Sparkles,
  MessageSquare,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { useInView } from "@/hooks/use-in-view";
import { contactFormIssue } from "@/lib/validations/form-checks";
import { useVisitorCountry } from "@/components/shared/visitor-country";
import { countryConfig, type CountryCode } from "@/lib/countries";

/* ──────────────────── DATA ──────────────────── */

const contactInfo = [
  {
    icon: Mail,
    title: "البريد الإلكتروني",
    value: "info@naseebak.com",
    href: "mailto:info@naseebak.com",
  },
  {
    icon: MapPin,
    title: "العنوان",
    value: "عمّان، الأردن",
  },
];

/** Saudi version (reviewed copy from naseebak-ksa) */
const saContactInfo = [
  contactInfo[0],
  {
    icon: MapPin,
    title: "الموقع",
    // [NEEDS INPUT] city / registered address of the Saudi entity, if the owner wants one shown
    value: "المملكة العربية السعودية",
  },
];

/** Lebanon: the country only */
const lbContactInfo = [
  contactInfo[0],
  {
    icon: MapPin,
    title: "الموقع",
    // [NEEDS INPUT] city / registered address for Lebanon, if the owner wants one shown
    value: "لبنان",
  },
];

const CONTACT_INFO: Record<CountryCode, typeof contactInfo> = { JO: contactInfo, SA: saContactInfo, LB: lbContactInfo };

/** The phone field's placeholder, in the local form */
const PHONE_PLACEHOLDER: Record<CountryCode, string> = { JO: "07XXXXXXXX", SA: "05XXXXXXXX", LB: "03XXXXXX" };

/* ══════════════════════════════════════════════════════ */
/*                  CONTACT PAGE                         */
/* ══════════════════════════════════════════════════════ */

export default function ContactPage() {
  const country = useVisitorCountry();
  /** «هاتف» / «جوال» */
  const handset = countryConfig(country).words.phone;
  const { ref: formRef, inView: formInView } = useInView(0.15);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    subject: "",
    message: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<{ message: string; field: string | null } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "sending") return;
    // Same rules as the API, checked here first so the message points at the field
    // (a zod-free copy of the server's rules: the zod chunk stays off this public page)
    const issue = contactFormIssue({ ...formData, website }, country);
    if (issue) {
      setError({ message: issue.message, field: issue.field });
      document.getElementById(issue.field)?.focus();
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, website, country }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError({ message: data.error || "تعذّر إرسال رسالتك. يمكنك المحاولة مرة أخرى.", field: data.field ?? null });
        setStatus("idle");
        return;
      }
      setStatus("sent");
      setFormData({ name: "", phone: "", email: "", subject: "", message: "" });
    } catch {
      setError({ message: "تعذّر الاتصال. يمكنك التحقق من الإنترنت والمحاولة مرة أخرى.", field: null });
      setStatus("idle");
    }
  }

  const invalid = (field: string) => (error?.field === field ? true : undefined);

  return (
    <>
      <Navbar />

      <main id="main" tabIndex={-1} className="overflow-hidden">
        {/* ═══════════════ HERO SECTION ═══════════════ */}
        <section className="landing-night relative flex min-h-[40vh] items-center justify-center overflow-hidden pt-24 text-white">
          {/* The landing look (P2-7 / DS-20): the navy night with the gold eight-point star */}
          <div className="landing-khatam absolute inset-0" aria-hidden />

          <div className="container relative mx-auto px-4 py-16 text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-white/10 backdrop-blur-sm px-5 py-2 text-sm font-medium text-accent mb-8 shadow-sm"
              style={{ animation: "fadeSlideDown var(--motion-sheet) var(--motion-ease) both" }}
            >
              <MessageSquare className="size-4" />
              تواصل معنا
            </div>

            {/* Heading */}
            <h1
              className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl"
              style={{ animation: "fadeSlideUp var(--motion-sheet) var(--motion-ease) 0.2s both" }}
            >
              نحن هنا{" "}
              <span className="text-accent">
                لمساعدتك
              </span>
            </h1>

            {/* Description */}
            <p
              className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-white/75"
              style={{ animation: "fadeSlideUp var(--motion-sheet) var(--motion-ease) 0.4s both" }}
            >
              لديك سؤال أو استفسار؟ فريقنا جاهز لمساعدتك. يمكنك التواصل معنا
              وسنرد عليك في أقرب وقت ممكن.
            </p>
          </div>
        </section>

        {/* ═══════════════ CONTACT FORM + INFO SECTION ═══════════════ */}
        <section className="relative py-20">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div
            className="container mx-auto px-4"
            ref={formRef}
          >
            <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-5">
              {/* Contact Form — Left Column */}
              <Card
                className={`lg:col-span-3 relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-700 ${
                  formInView
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
              >
                {/* Top gradient accent bar */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-primary via-secondary to-accent" />

                <CardHeader>
                  <CardTitle className="text-xl font-bold">
                    أرسل لنا رسالة
                  </CardTitle>
                </CardHeader>

                <CardContent className="-mt-2">
                  {status === "sent" ? (
                    <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
                      <CheckCircle2 className="size-12 text-emerald-600" aria-hidden="true" />
                      <h3 className="text-lg font-bold">وصلتنا رسالتك</h3>
                      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                        شكراً لتواصلك مع نصيبك. سنرد عليك على رقم {handset}ك أو بريدك الإلكتروني في أقرب وقت ممكن.
                      </p>
                      <Button variant="outline" className="mt-2 rounded-xl" onClick={() => setStatus("idle")}>
                        إرسال رسالة أخرى
                      </Button>
                    </div>
                  ) : (
                  <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                    {error && (
                      <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                        {error.message}
                      </div>
                    )}
                    {/* Honeypot: hidden from people and screen readers */}
                    <div className="hidden" aria-hidden="true">
                      <label htmlFor="website">Website</label>
                      <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </div>
                    {/* Name */}
                    <div className="space-y-2">
                      <Label htmlFor="name">الاسم الكامل</Label>
                      <Input
                        id="name"
                        name="name"
                        aria-invalid={invalid("name")}
                        required
                        type="text"
                        placeholder="أدخل اسمك الكامل"
                        value={formData.name}
                        onChange={handleChange}
                        className="h-12 rounded-xl border-border/60 bg-background/50 backdrop-blur-sm"
                      />
                    </div>

                    {/* Phone (members sign up with a phone) — a phone or an email is enough */}
                    <div className="space-y-2">
                      <Label htmlFor="phone">رقم ال{handset}</Label>
                      <Input
                        id="phone"
                        name="phone"
                        aria-invalid={invalid("phone")}
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        placeholder={PHONE_PLACEHOLDER[country]}
                        value={formData.phone}
                        onChange={handleChange}
                        className="h-12 rounded-xl border-border/60 bg-background/50 backdrop-blur-sm text-left"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <Label htmlFor="email">
                        البريد الإلكتروني <span className="text-muted-foreground font-normal">(اختياري إذا أدخلت رقم ال{handset})</span>
                      </Label>
                      <Input
                        id="email"
                        name="email"
                        aria-invalid={invalid("email")}
                        type="email"
                        dir="ltr"
                        placeholder="example@email.com"
                        value={formData.email}
                        onChange={handleChange}
                        className="h-12 rounded-xl border-border/60 bg-background/50 backdrop-blur-sm text-left"
                      />
                    </div>

                    {/* Subject */}
                    <div className="space-y-2">
                      <Label htmlFor="subject">الموضوع</Label>
                      <Input
                        id="subject"
                        name="subject"
                        aria-invalid={invalid("subject")}
                        required
                        type="text"
                        placeholder="موضوع رسالتك"
                        value={formData.subject}
                        onChange={handleChange}
                        className="h-12 rounded-xl border-border/60 bg-background/50 backdrop-blur-sm"
                      />
                    </div>

                    {/* Message */}
                    <div className="space-y-2">
                      <Label htmlFor="message">الرسالة</Label>
                      <textarea
                        id="message"
                        name="message"
                        aria-invalid={invalid("message")}
                        required
                        maxLength={2000}
                        rows={6}
                        placeholder="اكتب رسالتك هنا..."
                        value={formData.message}
                        onChange={handleChange}
                        className="w-full rounded-xl border border-border/60 bg-background/50 backdrop-blur-sm px-3 py-3 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm resize-none"
                      />
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      size="lg"
                      disabled={status === "sending"}
                      className="group w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 bg-gradient-to-l from-primary to-primary/90 hover:shadow-xl hover:shadow-primary/30 transition-all duration-500 hover:scale-[1.01]"
                    >
                      <span className="flex items-center justify-center gap-2">
                        {status === "sending" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                        إرسال الرسالة
                        <Send className="size-4 transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-0.5" aria-hidden="true" />
                      </span>
                    </Button>
                  </form>
                  )}
                </CardContent>
              </Card>

              {/* Info Cards — Right Column */}
              <div
                className={`lg:col-span-2 flex flex-col gap-6 transition-all duration-700 ${
                  formInView
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{
                  transitionDelay: formInView ? "150ms" : "0ms",
                }}
              >
                {/* Contact info cards */}
                {CONTACT_INFO[country].map((info, i) => (
                  <Card
                    key={info.title}
                    className={`relative overflow-hidden rounded-2xl bg-card/80 border transition-all duration-500 hover:border-primary/20 hover:shadow-lg ${
                      formInView
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-8"
                    }`}
                    style={{
                      transitionDelay: formInView
                        ? `${(i + 1) * 100 + 150}ms`
                        : "0ms",
                    }}
                  >
                    <CardContent className="flex items-center gap-4 py-5">
                      {/* Icon in gradient circle */}
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-bl from-primary/10 to-secondary/10 text-primary">
                        <info.icon className="size-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold mb-0.5">
                          {info.title}
                        </h3>
                        <p
                          className="text-sm text-muted-foreground"
                          dir={info.href ? "ltr" : undefined}
                          style={info.href ? { textAlign: "start" } : undefined}
                        >
                          {info.href ? (
                            <a href={info.href} className="hover:text-primary transition-colors">
                              {info.value}
                            </a>
                          ) : (
                            info.value
                          )}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ FAQ MINI SECTION ═══════════════ */}
        <section className="relative py-16">
          <div className="absolute inset-0 bg-muted/20" />
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div className="container relative mx-auto px-4 text-center">
            <div className="mx-auto max-w-xl">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gradient-to-bl from-primary/10 to-secondary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
              <h2 className="text-2xl font-bold sm:text-3xl">
                لم تجد إجابتك؟
              </h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">
                يمكنك الاطلاع على صفحة الأسئلة الشائعة للحصول على إجابات
                لأكثر الأسئلة تكراراً حول منصة نصيبك.
              </p>
              <div className="mt-8">
                <Button
                  variant="outline"
                  size="lg"
                  asChild
                  className="group h-12 px-8 text-base font-medium border-primary/20 hover:bg-primary/[0.04] hover:border-primary/30 transition-all duration-500 hover:scale-[1.02]"
                >
                  <Link href="/faq">
                    <span className="flex items-center gap-2">
                      عرض جميع الأسئلة الشائعة
                    </span>
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* Global keyframe animations */}
      <style jsx global>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeSlideDown {
          from {
            opacity: 0;
            transform: translateY(-16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes fadeSlideRight {
          from {
            opacity: 0;
            transform: translateX(16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
