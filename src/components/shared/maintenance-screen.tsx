import Image from "next/image";
import { Wrench, Mail } from "lucide-react";

const DEFAULT_MESSAGE = "نعمل حالياً على تحسينات لتقديم تجربة أفضل لكم. سنعود قريباً بإذن الله.";

/** Full-page screen shown to visitors and users while maintenance mode is on. */
export function MaintenanceScreen({ message }: { message?: string }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

      <div className="relative w-full max-w-lg rounded-3xl border border-border/60 bg-card/90 p-8 text-center shadow-xl backdrop-blur-sm sm:p-10">
        <Image src="/images/logo.svg" alt="نصيبك" width={160} height={70} className="mx-auto h-14 w-auto" priority />

        <div className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-white shadow-lg shadow-primary/20">
          <Wrench className="h-8 w-8" />
        </div>

        <h1 className="mt-6 text-2xl font-extrabold sm:text-3xl">
          الموقع{" "}
          <span className="bg-gradient-to-l from-primary to-accent bg-clip-text text-transparent">تحت الصيانة</span>
        </h1>

        <p className="mt-4 leading-relaxed text-muted-foreground">{message?.trim() || DEFAULT_MESSAGE}</p>

        <div className="mt-8 border-t border-border/50 pt-6 text-sm text-muted-foreground">
          <p>نعتذر عن الإزعاج، ونشكر صبركم.</p>
          <a
            href="mailto:info@naseebak.com"
            className="mt-2 inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            dir="ltr"
          >
            <Mail className="h-4 w-4" />
            info@naseebak.com
          </a>
        </div>
      </div>
    </main>
  );
}
