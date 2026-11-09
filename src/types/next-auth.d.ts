import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      gender: string;
      isVerified: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    gender: string;
    isVerified: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    gender: string;
    isVerified: boolean;
    /** When this session signed in (ms), kept through every refresh: src/lib/session-revocation.ts */
    authAt?: number;
  }
}
