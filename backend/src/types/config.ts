export type NodeEnvironment = 'development' | 'production' | 'test' | 'staging';

export interface ServerConfig {
  port: number;
  host: string;
  env: NodeEnvironment;
}

export interface DatabaseConfig {
  url?: string;
}

export interface RedisConfig {
  url: string;
  password: string;
}

export interface JwtConfig {
  secret?: string;
  expiresIn: string;
  refreshSecret?: string;
  refreshExpiresIn: string;
}

export interface SessionConfig {
  secret?: string;
  maxAge: number;
}

export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user?: string;
      pass?: string;
    };
  };
  from: {
    email: string;
    name: string;
  };
}

export interface PaymentConfig {
  stripe: {
    secretKey?: string;
    publishableKey?: string;
    webhookSecret?: string;
  };
}

export interface SolarConfig {
  apiUrl: string;
  apiKey?: string;
}

export interface DockerConfig {
  host: string;
  registry: string;
  tlsVerify: boolean;
  certPath: string;
  vmNetwork: string;
  vmSubnet: string;
}

export interface UploadConfig {
  maxFileSize: number;
  uploadPath: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface LoggingConfig {
  level: string;
  filePath: string;
}

export interface SecurityConfig {
  bcryptRounds: number;
  corsOrigin: string;
}

export interface UrlConfig {
  frontend: string;
  backend: string;
  apiBase: string;
}

export interface FeatureFlags {
  enableSolarMonitoring: boolean;
  enablePayments: boolean;
  enableEmailNotifications: boolean;
}

export interface AppConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  session: SessionConfig;
  email: EmailConfig;
  payment: PaymentConfig;
  solar: SolarConfig;
  docker: DockerConfig;
  upload: UploadConfig;
  rateLimit: RateLimitConfig;
  logging: LoggingConfig;
  security: SecurityConfig;
  urls: UrlConfig;
  features: FeatureFlags;
}
