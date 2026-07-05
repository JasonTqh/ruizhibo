import { UserRole } from "@prisma/client";

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  phone: string | null;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}
