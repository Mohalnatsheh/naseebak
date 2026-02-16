import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold text-primary">نصيب</h1>
        <p className="text-xl text-muted-foreground">
          منصة تيسير الزواج التقليدي في الأردن
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/register"
          className="rounded-lg bg-primary px-6 py-3 text-primary-foreground font-medium hover:opacity-90 transition"
        >
          إنشاء حساب
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-border px-6 py-3 font-medium hover:bg-muted transition"
        >
          تسجيل الدخول
        </Link>
      </div>
    </main>
  );
}
