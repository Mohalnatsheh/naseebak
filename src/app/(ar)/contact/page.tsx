"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Phone,
  Mail,
  MapPin,
  Send,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { useInView } from "@/hooks/use-in-view";
import { IslamicPatternBg } from "@/components/shared/islamic-pattern";

/* ──────────────────── DATA ──────────────────── */

const contactInfo = [
  {
    icon: Phone,
    title: "الهاتف",
    value: "+962 7 0000 0000",
  },
  {
    icon: Mail,
    title: "البريد الإلكتروني",
    value: "info@naseeb.jo",
  },
  {
    icon: MapPin,
    title: "العنوان",
    value: "عمّان، الأردن",
  },
];

/* ══════════════════════════════════════════════════════ */
/*                  CONTACT PAGE                         */
/* ══════════════════════════════════════════════════════ */

export default function ContactPage() {
  const formView = useInView(0.15);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // UI-only — no actual submission
  }

  return (
    <>
      <Navbar />

      <main className="overflow-hidden">
        {/* ═══════════════ HERO SECTION ═══════════════ */}
        <section className="relative min-h-[40vh] flex items-center justify-center pt-24">
          {/* Gradient background */}
          <div className="absolute inset-0 bg-gradient-to-bl from-primary/[0.06] via-background to-secondary/[0.04]" />

          {/* Decorative blurred orbs */}
          <div
            className="absolute top-20 start-10 h-60 w-60 rounded-full bg-primary/[0.06] blur-3xl animate-pulse"
            style={{ animationDuration: "8s" }}
          />
          <div
            className="absolute bottom-10 end-10 h-72 w-72 rounded-full bg-secondary/[0.08] blur-3xl animate-pulse"
            style={{ animationDuration: "10s" }}
          />

          {/* Islamic pattern overlay */}
          <div className="absolute top-10 end-0 w-64 h-64 text-primary opacity-[0.03] rotate-12">
            <IslamicPatternBg className="w-full h-full" />
          </div>
          <div className="absolute bottom-0 start-0 w-48 h-48 text-secondary opacity-[0.03] -rotate-6">
            <IslamicPatternBg className="w-full h-full" />
          </div>

          <div className="container relative mx-auto px-4 py-16 text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/[0.06] backdrop-blur-sm px-5 py-2 text-sm font-medium text-primary mb-8 shadow-sm"
              style={{ animation: "fadeSlideDown 0.8s ease-out both" }}
            >
              <MessageSquare className="size-4 animate-pulse" />
              تواصل معنا
            </div>

            {/* Heading */}
            <h1
              className="mx-auto max-w-4xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.2s both" }}
            >
              نحن هنا{" "}
              <span className="bg-gradient-to-l from-primary to-secondary bg-clip-text text-transparent">
                لمساعدتك
              </span>
            </h1>

            {/* Description */}
            <p
              className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground"
              style={{ animation: "fadeSlideUp 0.8s ease-out 0.4s both" }}
            >
              لديك سؤال أو استفسار؟ فريقنا جاهز لمساعدتك. تواصل معنا وسنرد
              عليك في أقرب وقت ممكن.
            </p>
          </div>
        </section>

        {/* ═══════════════ CONTACT FORM + INFO SECTION ═══════════════ */}
        <section className="relative py-20">
          <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-l from-transparent via-border to-transparent" />

          <div
            className="container mx-auto px-4"
            ref={formView.ref}
          >
            <div className="mx-auto max-w-6xl grid gap-8 lg:grid-cols-5">
              {/* Contact Form — Left Column */}
              <Card
                className={`lg:col-span-3 relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm transition-all duration-700 ${
                  formView.inView
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
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Name */}
                    <div className="space-y-2">
                      <Label htmlFor="name">الاسم الكامل</Label>
                      <Input
                        id="name"
                        name="name"
                        type="text"
                        placeholder="أدخل اسمك الكامل"
                        value={formData.name}
                        onChange={handleChange}
                        className="h-12 rounded-xl border-border/60 bg-background/50 backdrop-blur-sm"
                      />
                    </div>

                    {/* Email */}
                    <div className="space-y-2">
                      <Label htmlFor="email">البريد الإلكتروني</Label>
                      <Input
                        id="email"
                        name="email"
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
                      className="group w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 bg-gradient-to-l from-primary to-primary/90 hover:shadow-xl hover:shadow-primary/30 transition-all duration-500 hover:scale-[1.01]"
                    >
                      <span className="flex items-center justify-center gap-2">
                        إرسال الرسالة
                        <Send className="size-4 transition-transform duration-300 group-hover:-translate-x-1 group-hover:-translate-y-0.5" />
                      </span>
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Info Cards — Right Column */}
              <div
                className={`lg:col-span-2 flex flex-col gap-6 transition-all duration-700 ${
                  formView.inView
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8"
                }`}
                style={{
                  transitionDelay: formView.inView ? "150ms" : "0ms",
                }}
              >
                {/* Contact info cards */}
                {contactInfo.map((info, i) => (
                  <Card
                    key={info.title}
                    className={`relative overflow-hidden rounded-2xl bg-card/80 border transition-all duration-500 hover:border-primary/20 hover:shadow-lg ${
                      formView.inView
                        ? "opacity-100 translate-y-0"
                        : "opacity-0 translate-y-8"
                    }`}
                    style={{
                      transitionDelay: formView.inView
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
                          dir={info.title === "البريد الإلكتروني" || info.title === "الهاتف" ? "ltr" : undefined}
                          style={info.title === "البريد الإلكتروني" || info.title === "الهاتف" ? { textAlign: "start" } : undefined}
                        >
                          {info.value}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Map placeholder */}
                <div
                  className={`rounded-2xl bg-muted/40 border border-dashed border-border/60 h-48 flex flex-col items-center justify-center gap-3 text-muted-foreground transition-all duration-700 ${
                    formView.inView
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-8"
                  }`}
                  style={{
                    transitionDelay: formView.inView ? "550ms" : "0ms",
                  }}
                >
                  <MapPin className="size-8 opacity-40" />
                  <p className="text-sm font-medium opacity-60">
                    خريطة الموقع
                  </p>
                </div>
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
