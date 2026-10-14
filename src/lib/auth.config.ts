import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAdmin = isLoggedIn && auth.user.role === "ADMIN";
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnAdminLogin = nextUrl.pathname === "/admin/login";
      const isOnAdmin = nextUrl.pathname.startsWith("/admin");
      const isOnAuth = nextUrl.pathname === "/login" || nextUrl.pathname === "/register";

      if (isOnAdminLogin) {
        if (isAdmin) return Response.redirect(new URL("/admin", nextUrl));
        return true;
      }
      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect to login
      }
      if (isOnAdmin) {
        if (isAdmin) return true;
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
        return Response.redirect(new URL("/admin/login", nextUrl));
      }
      if (isOnAuth && isLoggedIn) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.gender = user.gender;
        token.isVerified = user.isVerified;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.gender = token.gender as string;
        session.user.isVerified = token.isVerified as boolean;
      }
      return session;
    },
  },
  providers: [], // Added in auth.ts
} satisfies NextAuthConfig;
