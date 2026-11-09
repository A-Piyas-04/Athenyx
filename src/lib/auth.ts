import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Auth.js configuration.
 *
 * Sign-in uses the GitHub App's OAuth credentials (Client ID / Client secret),
 * not an separate OAuth App, so the same app that reads repositories also
 * identifies the user. Sessions are stored in the database.
 *
 * GitHub Apps do not use OAuth scopes — access is defined by the app's
 * installed permissions — so no `scope` parameter is requested here.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db) as Adapter,
  session: { strategy: "database" },
  secret: env.AUTH_SECRET,
  // Athenyx is self-hosted (localhost in development), so the request host is
  // ours to trust. Without this, Auth.js rejects every request as UntrustedHost.
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    GitHub({
      clientId: env.AUTH_GITHUB_ID,
      clientSecret: env.AUTH_GITHUB_SECRET,
      // Keep the GitHub login alongside the standard fields so the UI can show
      // it; the Prisma adapter passes extra keys through to `user.create`.
      profile(profile) {
        return {
          id: profile.id.toString(),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
          githubLogin: profile.login,
        };
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    /**
     * Auth.js only writes account tokens when the account is first linked.
     * GitHub App user tokens expire (8 hours, with a 6-month refresh token),
     * so refresh the stored copy on every sign-in, and keep `githubLogin`
     * current for users created before that field was populated.
     */
    async signIn({ user, account, profile }) {
      if (!user.id) return;

      if (account) {
        await db.account.updateMany({
          where: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
          data: {
            access_token: account.access_token,
            refresh_token: account.refresh_token,
            expires_at: account.expires_at,
            refresh_token_expires_in:
              typeof account.refresh_token_expires_in === "number"
                ? account.refresh_token_expires_in
                : null,
            token_type: account.token_type,
            scope: account.scope,
            id_token: account.id_token,
          },
        });
      }

      const login =
        profile && typeof profile.login === "string" ? profile.login : null;
      if (login) {
        await db.user.updateMany({
          where: { id: user.id, NOT: { githubLogin: login } },
          data: { githubLogin: login },
        });
      }
    },
  },
});
