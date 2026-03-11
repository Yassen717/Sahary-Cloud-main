-- CreateTable: hosting_plans
CREATE TABLE "hosting_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "diskGB" INTEGER NOT NULL,
    "bandwidthGB" INTEGER NOT NULL,
    "maxDomains" INTEGER NOT NULL DEFAULT 1,
    "maxDatabases" INTEGER NOT NULL DEFAULT 1,
    "maxFtpAccounts" INTEGER NOT NULL DEFAULT 1,
    "monthlyPrice" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "stripeProductId" TEXT,
    "stripePriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hosting_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable: hosting_accounts
CREATE TABLE "hosting_accounts" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "diskQuota" INTEGER NOT NULL,
    "bandwidthQuota" INTEGER NOT NULL,
    "diskUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandwidthUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ftpUser" TEXT,
    "ftpPassword" TEXT,
    "dbName" TEXT,
    "dbUser" TEXT,
    "dbPassword" TEXT,
    "sslEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sslExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "terminatedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,

    CONSTRAINT "hosting_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hosting_plans_name_key" ON "hosting_plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "hosting_accounts_domain_key" ON "hosting_accounts"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "hosting_accounts_ftpUser_key" ON "hosting_accounts"("ftpUser");

-- CreateIndex
CREATE INDEX "hosting_accounts_userId_idx" ON "hosting_accounts"("userId");

-- CreateIndex
CREATE INDEX "hosting_accounts_domain_idx" ON "hosting_accounts"("domain");

-- CreateIndex
CREATE INDEX "hosting_accounts_status_idx" ON "hosting_accounts"("status");

-- AddForeignKey
ALTER TABLE "hosting_accounts" ADD CONSTRAINT "hosting_accounts_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hosting_accounts" ADD CONSTRAINT "hosting_accounts_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "hosting_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
