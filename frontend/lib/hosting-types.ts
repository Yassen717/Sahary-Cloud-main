export type HostingAccountStatus = 'PROVISIONING' | 'ACTIVE' | 'SUSPENDED' | 'PROVISION_FAILED' | 'TERMINATED';
export type SuspendReason = 'PAYMENT_FAILED' | 'SUBSCRIPTION_CANCELED' | 'BANDWIDTH_EXCEEDED' | 'ADMIN' | 'ABUSE';
export type SslStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'FAILED';
export type UsageLevel = 'OK' | 'WARNING' | 'EXCEEDED';            // WARNING >= 80 %, EXCEEDED >= 100 %

export interface HostingPlanDTO {
  id: string; name: string; description: string | null;
  diskGB: number; bandwidthGB: number; maxDomains: number; maxDatabases: number; maxFtpAccounts: number;
  monthlyPrice: number; currency: 'USD'; isActive: boolean;
  purchasable: boolean;                                              // stripePriceId is set
}
export interface HostingDomainDTO {
  id: string; domain: string; isVerified: boolean;
  verification: { recordType: 'TXT'; host: string; value: string } | null;   // null once verified; host = the domain, value = `sahary-verify=<token>`
  verifyToken: string | null;                                        // legacy-compat (raw token while unverified)
  sslEnabled: boolean;                                               // legacy-compat (= ssl.enabled)
  ssl: { status: SslStatus; enabled: boolean; issuedAt: string | null; expiresAt: string | null; lastError: string | null };
  createdAt: string;
}
export interface HostingUsageSummary {
  diskUsedGB: number; diskQuotaGB: number; diskLevel: UsageLevel;
  bandwidthUsedGB: number; bandwidthQuotaGB: number; bandwidthLevel: UsageLevel;
  bandwidthCycleStart: string | null; bandwidthCycleEnd: string | null; updatedAt: string | null;
}
export interface HostingSubscriptionSummary { status: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean }
export interface HostingAccountDTO {
  id: string; domain: string; url: string;                           // url = (ssl.enabled ? https : http) + '://' + domain
  status: HostingAccountStatus; suspendReason: SuspendReason | null;
  plan: HostingPlanDTO; usage: HostingUsageSummary;
  ssl: { enabled: boolean; expiresAt: string | null };               // primary subdomain
  subscription: HostingSubscriptionSummary | null;
  domains: HostingDomainDTO[]; ftpUser: string | null; createdAt: string;
}
export interface HostingDatabaseDTO { id: string; name: string; isPrimary: boolean; createdAt: string }
export interface HostingDatabasesDTO {
  enabled: boolean; host: string; port: number; username: string | null; passwordSet: boolean; limit: number; databases: HostingDatabaseDTO[];
}
export interface HostingFtpDTO { enabled: boolean; host: string; port: number; username: string | null; passwordSet: boolean }
export interface HostingCredentialRevealDTO { host: string; port: number; username: string; password: string }   // plaintext, shown ONCE
export interface FileEntryDTO { name: string; path: string; type: 'file' | 'directory'; size: number; modifiedAt: string; mime: string | null }
export interface FileListDTO { path: string; parent: string | null; entries: FileEntryDTO[]; truncated: boolean }   // dirs first, then name; max 5000 entries
export interface HostingUsageDTO extends HostingUsageSummary { history: Array<{ date: string; diskUsedGB: number; bandwidthUsedGB: number }> }   // last 30 days
export interface CheckoutSessionDTO { checkoutUrl: string; sessionId: string }
export interface PortalSessionDTO { portalUrl: string }
export interface SubscriptionStatusDTO { hasSubscription: boolean; subscription: HostingSubscriptionSummary | null; plan: HostingPlanDTO | null; accountStatus: HostingAccountStatus | null }
export interface Paginated<T> { items: T[]; page: number; limit: number; total: number }
export interface AdminHostingAccountDTO {
  id: string; domain: string; status: HostingAccountStatus; suspendReason: SuspendReason | null; provisioningError: string | null;
  owner: { id: string; email: string; firstName: string; lastName: string }; plan: { id: string; name: string };
  usage: HostingUsageSummary; subscription: HostingSubscriptionSummary | null; domainCount: number; databaseCount: number;
  createdAt: string; suspendedAt: string | null; terminatedAt: string | null;
}
export interface AdminHostingAccountDetailDTO extends AdminHostingAccountDTO { domains: HostingDomainDTO[]; databases: HostingDatabaseDTO[]; ftpUser: string | null }
export interface AdminHostingPlanDTO extends HostingPlanDTO { stripeProductId: string | null; stripePriceId: string | null; accountCount: number }
export interface AdminHostingStatsDTO {
  accounts: { total: number; active: number; suspended: number; provisioning: number; failed: number; terminated: number };
  mrr: number;                                                       // sum(monthlyPrice) of ACTIVE accounts whose subscriptionStatus is active|trialing|past_due
  usage: { diskUsedGB: number; diskQuotaGB: number; bandwidthUsedGB: number; bandwidthQuotaGB: number };
  ssl: { active: number; expiringWithin14Days: number; failed: number };
  plans: Array<{ planId: string; name: string; accounts: number }>;
}
