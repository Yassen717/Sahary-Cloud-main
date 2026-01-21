#!/bin/bash

# PostgreSQL Migration Script
# This script automates the migration from SQLite to PostgreSQL

set -e

echo "🚀 Starting PostgreSQL Migration..."
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must run from backend directory${NC}"
    exit 1
fi

# Function to check Docker permissions
check_docker() {
    if docker ps >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Step 1: Check Docker
echo "📦 Step 1: Checking Docker..."
if check_docker; then
    echo -e "${GREEN}✅ Docker is accessible${NC}"
else
    echo -e "${YELLOW}⚠️  Docker requires sudo. Attempting with sudo...${NC}"
    if ! sudo docker ps >/dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running or not accessible${NC}"
        echo "Please start Docker or add your user to docker group:"
        echo "  sudo usermod -aG docker \$USER"
        echo "  newgrp docker"
        exit 1
    fi
    DOCKER_CMD="sudo docker"
    COMPOSE_CMD="sudo docker-compose"
fi

# Set commands
DOCKER_CMD=${DOCKER_CMD:-docker}
COMPOSE_CMD=${COMPOSE_CMD:-docker-compose}

# Step 2: Start PostgreSQL
echo ""
echo "🐘 Step 2: Starting PostgreSQL container..."
$COMPOSE_CMD -f docker-compose.dev.yml up -d postgres redis 2>&1 | grep -v "version.*obsolete" || true

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to initialize..."
sleep 5

# Check if PostgreSQL is ready
MAX_RETRIES=30
RETRY_COUNT=0
until $DOCKER_CMD exec sahary-postgres pg_isready -U sahary_user -d sahary_cloud >/dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo -e "${RED}❌ PostgreSQL failed to start${NC}"
        exit 1
    fi
    echo "  Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 1
done

echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Step 3: Generate Prisma Client
echo ""
echo "🔧 Step 3: Generating Prisma Client..."
npx prisma generate

echo -e "${GREEN}✅ Prisma Client generated${NC}"

# Step 4: Run Migration
echo ""
echo "📊 Step 4: Running database migration..."
npx prisma migrate dev --name init_postgresql

echo -e "${GREEN}✅ Migration completed${NC}"

# Step 5: Verify
echo ""
echo "🔍 Step 5: Verifying migration..."
$DOCKER_CMD exec sahary-postgres psql -U sahary_user -d sahary_cloud -c "\dt" | head -20

echo ""
echo -e "${GREEN}✅ PostgreSQL Migration Complete!${NC}"
echo ""
echo "📝 Next steps:"
echo "  1. Start backend: npm run dev"
echo "  2. Check health: curl http://localhost:3000/health"
echo "  3. View database: npx prisma studio"
echo ""
echo "🎉 Database is now using PostgreSQL!"
