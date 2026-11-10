import type { LandingContent } from "./content";

/** How it works in four short, numbered steps — readable at a glance, right under the hero. */
export function LandingSteps({ content }: { content: LandingContent }) {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-border/60 bg-background py-16 sm:py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-center text-3xl font-extrabold text-primary sm:text-4xl">{content.ui.stepsTitle}</h2>
        <ol className="mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {content.steps.map((s, i) => (
            <li
              key={s.title}
              className="flex gap-4 rounded-3xl border border-border/70 bg-card p-5 shadow-[0_20px_40px_-34px_oklch(0.39_0.07_249/0.5)] sm:block sm:p-6"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-extrabold text-primary-foreground" aria-hidden>
                {i + 1}
              </span>
              <div>
                <h3 className="text-lg font-extrabold text-foreground sm:mt-4 sm:text-xl">{s.title}</h3>
                <p className="mt-1 leading-relaxed text-muted-foreground sm:mt-2">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
