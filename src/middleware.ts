import { withAuth } from "next-auth/middleware";

// Pages redirect to /login without a session. API routes are excluded: each one calls
// requireUser() itself and answers 401 JSON, which the client turns into a toast.
export default withAuth({ pages: { signIn: "/login" } });

export const config = {
  // Anything with a file extension (public/ assets like quo.png) is served without auth.
  matcher: ["/((?!api/|login|_next/static|_next/image|.*\\..*).*)"],
};
