export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: string;
  /** Present only on impersonation tokens — ID of the admin who started the impersonation */
  impersonatedBy?: string;
  /** Present only on impersonation tokens */
  isImpersonating?: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Seconds until the access token expires */
  expiresIn: number | null;
  /** ISO 8601 timestamp of when the access token expires */
  expiresAt?: string | null;
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
  avatar?: string | null;
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
