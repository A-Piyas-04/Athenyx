import { redirect } from "next/navigation";
import { Github } from "lucide-react";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { BrandMark } from "@/components/brand";
import { LoginPreview } from "@/components/login-preview";
import { Tilt } from "@/components/visuals/tilt";
import { PageTransition, Reveal } from "@/components/motion/primitives";
import { Button } from "@/components/ui/button";
import { auth, signIn } from "@/lib/auth";

export const metadata = { title: "Sign in · Athenyx" };

const PRINCIPLES = [
  { title: "Read-only", text: "Only the repositories you pick. Nothing is ever written, committed or deployed." },
  { title: "One exact commit", text: "Every review names the SHA it read, so findings never drift." },
  { title: "You start it", text: "Pushing code triggers nothing. Reviews run when you ask." },
];

export default async function LoginPage() {
  if (process.env.ATHENYX_PREVIEW === "1") redirect("/projects");
  const session = await auth();
  if (session?.user?.id) redirect("/projects");

  async function signInWithGithub() {
    "use server";
    await signIn("github", { redirectTo: "/projects" });
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <span className="inline-flex items-center gap-2.5">
          <BrandMark />
          <span className="font-display text-[17px] font-bold tracking-tight">Athenyx</span>
        </span>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-5 py-12 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:py-0">
        <PageTransition className="space-y-10">
          <h1 className="text-display text-[3rem] sm:text-[4.75rem]">
            Every finding
            <br />
            cites the line.
          </h1>
          <p className="max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
            Specialist AI reviewers read the commit you choose, quote the code they mean, and propose fixes with their trade-offs.
          </p>
          <form action={signInWithGithub} className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Button type="submit" size="lg">
              <Github />
              Sign in with GitHub
            </Button>
            <span className="text-sm text-muted-foreground">Free. No paid API keys.</span>
          </form>
        </PageTransition>

        <Tilt className="hidden justify-center py-10 lg:flex">
          <LoginPreview />
        </Tilt>
      </main>

      <Reveal as="section" className="mx-auto w-full max-w-6xl px-5 pt-8 pb-14 sm:px-8">
        <ul className="grid gap-8 border-t border-border pt-8 sm:grid-cols-3 sm:gap-12">
          {PRINCIPLES.map(({ title, text }) => (
            <li key={title} className="space-y-1.5">
              <h2 className="text-section">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}
