import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { UserMenu } from "@/components/app-shell/user-menu";
import { Brand } from "@/components/brand";
import { ScrollHeader } from "@/components/motion/scroll-header";
import { signOutAction } from "@/lib/actions/auth";
import type { SessionUser } from "@/lib/authz";

/** The header used outside a project (project list, connect flow). */
export function TopBar({ user, children }: { user: SessionUser; children?: React.ReactNode }) {
  return (
    <ScrollHeader hideOffset={64}>
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-5 sm:px-8">
        <Brand />
        <div className="flex-1">{children}</div>
        <ThemeToggle />
        <UserMenu name={user.name} email={user.email} image={user.image} onSignOut={signOutAction} />
      </div>
    </ScrollHeader>
  );
}
