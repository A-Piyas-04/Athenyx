import type { Metadata } from "next";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketingSurface } from "@/components/marketing/marketing-surface";
import { SignInCta } from "@/components/marketing/sign-in-cta";
import { POSITIONING } from "@/components/marketing/copy";
import { AssayHero } from "@/components/marketing/hero/assay-hero";
import { ArbiterSection } from "@/components/marketing/sections/arbiter-section";
import { BoardSection } from "@/components/marketing/sections/board-section";
import { ClosingCta } from "@/components/marketing/sections/closing-cta";
import { FindingAnatomySection } from "@/components/marketing/sections/finding-anatomy";
import { PipelineSection } from "@/components/marketing/sections/pipeline-section";
import {
  AdvisoryBand,
  CostSection,
  ProblemSection,
  ReleaseGateSection,
  ReviewTypesSection,
} from "@/components/marketing/sections/sections";
import { SurfacesSection } from "@/components/marketing/sections/surfaces-section";
import { auth, signIn } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Athenyx · An engineering review board that cites the line",
  description:
    "Nine AI specialists on the bench. Each review seats the two or three your code calls for, reads one exact commit read-only, and reports findings that quote the code they mean.",
  openGraph: {
    title: "Athenyx · An engineering review board that cites the line",
    description:
      "An independent AI engineering review board for your GitHub repositories. It advises; it does not act.",
    type: "website",
  },
};

/**
 * The landing page. Everyone sees it, signed in or not — only the call to
 * action changes — so the page stays shareable and linkable.
 *
 * It is a server component: the copy and the specialist roster are rendered on
 * the server, and only the components that genuinely need a hook are clients.
 */
export default async function Home() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  async function signInWithGithub() {
    "use server";
    await signIn("github", { redirectTo: "/projects" });
  }

  return (
    <>
      <MarketingSurface />
      <MarketingHeader signedIn={signedIn} />

      <main>
        <AssayHero>
          <h1 className="text-display text-[2.75rem] sm:text-[4.25rem] lg:text-[4.75rem]">
            An engineering review board that cites the line.
          </h1>
          <p className="max-w-[48ch] text-lg leading-relaxed text-muted-foreground">{POSITIONING}</p>
          <SignInCta signedIn={signedIn} signIn={signInWithGithub} />
        </AssayHero>

        <AdvisoryBand />
        <ProblemSection />
        <BoardSection />
        <PipelineSection />
        <FindingAnatomySection />
        <ArbiterSection />
        <ReviewTypesSection />
        <SurfacesSection />
        <ReleaseGateSection />
        <CostSection />

        <ClosingCta>
          <h2 className="text-display text-[2.5rem] sm:text-[3.5rem]">Ask for the first review.</h2>
          <p className="text-lg leading-relaxed text-muted-foreground">
            Connect one repository, pick a branch, and press Start Review. Nothing runs until you do.
          </p>
          <SignInCta signedIn={signedIn} signIn={signInWithGithub} />
        </ClosingCta>
      </main>

      <MarketingFooter />
    </>
  );
}
