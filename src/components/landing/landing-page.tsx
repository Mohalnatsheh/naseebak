import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import type { CountryCode } from "@/lib/countries";
import { contentFor, type LandingMode } from "./content";
import { LandingBody } from "./landing-body";

export function LandingPage({ mode, country }: { mode: LandingMode; country: CountryCode }) {
  const content = contentFor(mode, country);
  return (
    <>
      <Navbar />
      <LandingBody content={content} />
      <Footer />
    </>
  );
}
