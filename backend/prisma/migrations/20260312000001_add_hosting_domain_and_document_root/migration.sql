-- Add documentRoot column to hosting_accounts
ALTER TABLE "hosting_accounts" ADD COLUMN "documentRoot" TEXT;

-- CreateTable: hosting_domains
CREATE TABLE "hosting_domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyToken" TEXT,
    "sslEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sslIssuedAt" TIMESTAMP(3),
    "sslExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "hosting_domains_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hosting_domains_domain_key" ON "hosting_domains"("domain");

-- CreateIndex
CREATE INDEX "hosting_domains_accountId_idx" ON "hosting_domains"("accountId");

-- CreateIndex
CREATE INDEX "hosting_domains_domain_idx" ON "hosting_domains"("domain");

-- AddForeignKey
ALTER TABLE "hosting_domains" ADD CONSTRAINT "hosting_domains_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "hosting_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
