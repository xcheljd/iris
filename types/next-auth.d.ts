import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: "manager" | "associate";
      firstName: string;
      lastName: string | null;
    };
  }
  interface User {
    id: string;
    name?: string | null;
    email?: string | null;
    role: "manager" | "associate";
    firstName: string;
    lastName: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "manager" | "associate";
    firstName: string;
    lastName: string | null;
  }
}
