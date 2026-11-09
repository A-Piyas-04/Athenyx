import Link from "next/link";
import { ArrowUpRight, Github } from "lucide-react";
import { TopBar } from "@/components/app-shell/top-bar";
import { PageTransition } from "@/components/motion/primitives";
import { PageHeader } from "@/components/page-header";
import { ConnectRepoForm } from "@/components/projects/connect-repo-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePageUser } from "@/lib/authz";
import { appInstallUrl } from "@/lib/github/app";
import { isReauthRequired } from "@/lib/github/errors";
import { getUserGithubToken, listUserInstallationsWithRepos, type UserInstallation } from "@/lib/github/user";

export const metadata = { title: "Connect repository · Athenyx" };

export default async function NewProjectPage() {
  const user = await requirePageUser();
  const installUrl = appInstallUrl();

  let installations: UserInstallation[] = [];
  let loadError: "reauth" | "github" | null = null;

  try {
    const token = await getUserGithubToken(user.id);
    installations = await listUserInstallationsWithRepos(token);
  } catch (error) {
    loadError = isReauthRequired(error) ? "reauth" : "github";
    if (!isReauthRequired(error)) {
      console.error("[athenyx] Failed to list installations:", error);
    }
  }

  const hasRepos = installations.some((i) => i.repos.length > 0);

  return (
    <>
      <TopBar user={user} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-12 pb-24 sm:px-8 sm:pt-16">
        <PageTransition className="space-y-10">
          <PageHeader
            back={{ href: "/projects", label: "Projects" }}
            title="Connect a repository"
            description="Pick a repository you've given Athenyx access to, then the branch to review."
          />

          {loadError === "reauth" ? (
            <Alert variant="destructive">
              <AlertTitle>Your GitHub authorization expired</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>Sign in again to reconnect your GitHub account.</span>
                <Button asChild size="sm">
                  <Link href="/login">Reconnect GitHub</Link>
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {loadError === "github" ? (
            <Alert variant="destructive">
              <AlertTitle>Could not reach GitHub</AlertTitle>
              <AlertDescription>Your repositories didn&apos;t load. Reload the page to try again.</AlertDescription>
            </Alert>
          ) : null}

          {!loadError && !hasRepos ? (
            <div className="space-y-5 border-t border-border pt-8">
              <h2 className="text-title text-xl">First, install the GitHub App</h2>
              <p className="max-w-[56ch] text-sm leading-relaxed text-muted-foreground">
                Athenyx reads code with read-only access. On GitHub, choose <span className="font-medium text-foreground">Only select repositories</span>{" "}
                so it sees just the ones you pick. You&apos;ll come back here afterwards.
              </p>
              <Button asChild>
                <a href={installUrl} target="_blank" rel="noreferrer">
                  <Github />
                  Install on GitHub
                  <ArrowUpRight />
                </a>
              </Button>
            </div>
          ) : null}

          {hasRepos ? <ConnectRepoForm installations={installations} installUrl={installUrl} /> : null}
        </PageTransition>
      </main>
    </>
  );
}
