import Link from "next/link";
import Image from "next/image";
import { Heart, Facebook, Twitter, Instagram, Youtube } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-gradient-to-b from-card to-muted/40 border-t">
      {/* Gradient top border */}
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-l from-primary via-secondary to-accent" />

      {/* Decorative blur circles */}
      <div className="absolute -bottom-20 start-10 h-60 w-60 rounded-full bg-primary/[0.03] blur-3xl" />
      <div className="absolute -bottom-10 end-20 h-48 w-48 rounded-full bg-secondary/[0.03] blur-3xl" />

      <div className="container relative mx-auto max-w-7xl px-4 pt-16 pb-8">
        {/* 4-column grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">

          {/* Column 1: Brand + Newsletter */}
          <div className="sm:col-span-2 lg:col-span-1 space-y-5">
            <Link href="/" className="inline-flex items-center gap-2">
              <Image
                src="/images/logo.svg"
                alt="نصيبك"
                width={120}
                height={52}
                className="h-9 w-auto"
              />
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              منصة أردنية توصّل العائلات بالشريك الأنسب بالحلال — تقنية ذكية مع عادات أردنية أصيلة، بسترة واحترام.
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div className="space-y-4">
            <p className="font-bold text-sm">روابط سريعة</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/#features" className="hover:text-primary transition-colors duration-200">المميزات</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-primary transition-colors duration-200">كيف تعمل المنصة</Link></li>
              <li><Link href="/register" className="hover:text-primary transition-colors duration-200">إنشاء حساب</Link></li>
              <li><Link href="/login" className="hover:text-primary transition-colors duration-200">تسجيل الدخول</Link></li>
            </ul>
          </div>

          {/* Column 3: Pages */}
          <div className="space-y-4">
            <p className="font-bold text-sm">صفحات</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors duration-200">من نحن</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors duration-200">تواصل معنا</Link></li>
              <li><Link href="/blog" className="hover:text-primary transition-colors duration-200">المدونة</Link></li>
              <li><Link href="/faq" className="hover:text-primary transition-colors duration-200">الأسئلة الشائعة</Link></li>
            </ul>
          </div>

          {/* Column 4: Contact Info */}
          <div className="space-y-4">
            <p className="font-bold text-sm">تواصل معنا</p>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                البريد:{" "}
                <a href="mailto:info@naseebak.com" dir="ltr" className="hover:text-primary transition-colors">
                  info@naseebak.com
                </a>
              </li>
              <li>عمّان، الأردن</li>
            </ul>
            {/* Social Icons */}
            <div className="flex gap-2 pt-2">
              {([
                { Icon: Facebook, label: "فيسبوك" },
                { Icon: Twitter, label: "تويتر" },
                { Icon: Instagram, label: "انستغرام" },
                { Icon: Youtube, label: "يوتيوب" },
              ] as const).map(({ Icon, label }) => (
                <button key={label} aria-label={label} className="h-9 w-9 rounded-xl bg-muted/60 hover:bg-primary/10 hover:text-primary flex items-center justify-center text-muted-foreground transition-all duration-200">
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-border/40">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p className="flex items-center gap-1.5">
              صُنع بـ <Heart className="h-3.5 w-3.5 text-destructive fill-destructive" /> في الأردن
            </p>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-primary transition-colors duration-200">سياسة الخصوصية</Link>
              <span className="text-border">|</span>
              <Link href="/terms" className="hover:text-primary transition-colors duration-200">شروط الاستخدام</Link>
            </div>
            <p>&copy; {new Date().getFullYear()} نصيبك. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
