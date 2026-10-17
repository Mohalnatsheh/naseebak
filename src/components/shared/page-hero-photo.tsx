import Image from "next/image";

/**
 * Faint photo behind a public page's hero title (images in /public/images/pages, made with Runway),
 * fading into the page background so the title stays readable. Put it first inside the hero section
 * (`relative`); the hero content must be positioned (`relative`) to sit above it.
 */
export function PageHeroPhoto({ src, strength = "opacity-55" }: { src: string; strength?: string }) {
  return (
    <>
      <Image src={src} alt="" fill priority sizes="100vw" className={`object-cover ${strength}`} aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-b from-background/45 via-background/60 to-background" aria-hidden />
    </>
  );
}
