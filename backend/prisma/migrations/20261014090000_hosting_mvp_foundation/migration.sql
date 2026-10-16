-- AlterTable
ALTER TABLE "users" ADD COLUMN     "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "hosting_accounts" ADD COLUMN     "bandwidthAlertLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bandwidthCycleStart" TIMESTAMP(3),
ADD COLUMN     "bandwidthLogInode" TEXT,
ADD COLUMN     "bandwidthLogOffset" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "diskAlertLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "provisioningError" TEXT,
ADD COLUMN     "purgedAt" TIMESTAMP(3),
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT,
ADD COLUMN     "suspendReason" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "usageUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "hosting_domains" ADD COLUMN     "sslExpiryNoticeLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sslLastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "sslLastError" TEXT,
ADD COLUMN     "sslStatus" TEXT NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "hosting_databases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "hosting_databases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hosting_usage_snapshots" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "diskUsedGB" DOUBLE PRECISION NOT NULL,
    "bandwidthUsedGB" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "hosting_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hosting_databases_name_key" ON "hosting_databases"("name");

-- CreateIndex
CREATE INDEX "hosting_databases_accountId_idx" ON "hosting_databases"("accountId");

-- CreateIndex
CREATE INDEX "hosting_usage_snapshots_date_idx" ON "hosting_usage_snapshots"("date");

-- CreateIndex
CREATE UNIQUE INDEX "hosting_usage_snapshots_accountId_date_key" ON "hosting_usage_snapshots"("accountId", "date");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_status_updatedAt_idx" ON "stripe_webhook_events"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "hosting_accounts_stripeSubscriptionId_key" ON "hosting_accounts"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "hosting_domains_isVerified_sslStatus_idx" ON "hosting_domains"("isVerified", "sslStatus");

-- AddForeignKey
ALTER TABLE "hosting_databases" ADD CONSTRAINT "hosting_databases_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "hosting_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hosting_usage_snapshots" ADD CONSTRAINT "hosting_usage_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "hosting_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one primary hosting_databases row per existing non-TERMINATED
-- account that already has dbName (denormalized primary stays in place).
INSERT INTO "hosting_databases" ("id", "name", "isPrimary", "createdAt", "accountId")
SELECT 'c' || substr(md5(random()::text || a."id"), 1, 24),
       a."dbName", true, CURRENT_TIMESTAMP, a."id"
FROM "hosting_accounts" a
WHERE a."status" <> 'TERMINATED' AND a."dbName" IS NOT NULL;

-- Backfill: domains that already had SSL enabled become ACTIVE.
UPDATE "hosting_domains" SET "sslStatus" = 'ACTIVE' WHERE "sslEnabled" = true;

