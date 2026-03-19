export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number | null;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  avatar?: string;
}

export interface AuthActionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
  [key: string]: unknown;
}

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatar?: string | null;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  lastLoginAt?: Date | null;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
  emailVerificationRequired: boolean;
}

export interface PasswordResetResult {
  message: string;
  resetToken?: string;
  expiresAt?: Date;
}

export interface VerificationResult {
  user: PublicUser;
  message: string;
}
