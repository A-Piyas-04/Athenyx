import Link from "next/link";
import { ArrowRight, Github } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The page's one call to action, in both states. Signed-in visitors get a link
 * into the app rather than a pointless second sign-in.
 *
 * `signIn` is the server action from the page; it is the same
 * signIn("github") flow the /login route uses.
 */
export function SignInCta({
  signedIn,
  signIn,
  size = "lg",
  note = "Free. No paid API keys.",
}: {
  signedIn: boolean;
  signIn: () => Promise<void>;
  size?: "default" | "lg";
  note?: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {signedIn ? (
        <Button asChild size={size}>
          <Link href="/projects">
            Open dashboard
            <ArrowRight />
          </Link>
        </Button>
      ) : (
        <form action={signIn}>
          <Button type="submit" size={size}>
            <Github />
            Sign in with GitHub
          </Button>
        </form>
      )}
      {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
    </div>
  );
}
