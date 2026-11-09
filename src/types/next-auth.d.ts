import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      githubLogin?: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    githubLogin?: string | null;
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    githubLogin?: string | null;
  }
}
