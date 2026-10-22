import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { landingContent, type LandingMode } from "./content";
import { LandingBody } from "./landing-body";

export function LandingPage({ mode }: { mode: LandingMode }) {
  const content = landingContent(mode);
  return (
    <>
      <Navbar />
      <LandingBody content={content} />
      <Footer />
    </>
  );
}
