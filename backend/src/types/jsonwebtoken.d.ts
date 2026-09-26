declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number;
    issuer?: string;
    audience?: string;
    algorithm?: string;
  }

  export interface VerifyOptions {
    issuer?: string;
    audience?: string;
    algorithms?: string[];
  }

  export interface JwtPayload {
    [key: string]: unknown;
    exp?: number;
    iat?: number;
    sub?: string;
    userId?: string;
    email?: string;
    role?: string;
    type?: string;
  }

  export interface Jwt {
    header: Record<string, unknown>;
    payload: JwtPayload | string;
    signature: string;
  }

  export type Secret = string | Buffer;

  export function sign(payload: string | Buffer | object, secretOrPrivateKey: Secret, options?: SignOptions): string;
  export function verify(token: string, secretOrPublicKey: Secret, options?: VerifyOptions): JwtPayload | string;
  export function decode(token: string, options?: { complete?: boolean }): Jwt | JwtPayload | string | null;

  const jwt: {
    sign: typeof sign;
    verify: typeof verify;
    decode: typeof decode;
  };

  export default jwt;
}
