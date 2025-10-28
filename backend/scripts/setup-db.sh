#!/bin/bash

# Sahary Cloud Database Setup Script

set -e

echo "🚀 Setting up Sahary Cloud Database..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Start database services
echo -e "${YELLOW}📦 Starting database services...${NC}"
docker-compose -f docker-compose.dev.yml up -d postgres redis

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
until docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U sahary_user -d sahary_cloud; do
  echo "Waiting for PostgreSQL..."
  sleep 2
done

echo -e "${GREEN}✅ PostgreSQL is ready!${NC}"

# Wait for Redis to be ready
echo -e "${YELLOW}⏳ Waiting for Redis to be ready...${NC}"
until docker-compose -f docker-compose.dev.yml exec -T redis redis-cli ping; do
  echo "Waiting for Redis..."
  sleep 2
done

echo -e "${GREEN}✅ Redis is ready!${NC}"

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

# Generate Prisma client
echo -e "${YELLOW}🔧 Generating Prisma client...${NC}"
npx prisma generate

# Run database migrations
echo -e "${YELLOW}🗄️ Running database migrations...${NC}"
npx prisma migrate dev --name init

# Seed the database
echo -e "${YELLOW}🌱 Seeding database with initial data...${NC}"
npm run prisma:seed

echo -e "${GREEN}✅ Database setup completed successfully!${NC}"
echo ""
echo -e "${YELLOW}📊 Database Information:${NC}"
echo "  PostgreSQL: localhost:5432"
echo "  Database: sahary_cloud"
echo "  Username: sahary_user"
echo "  Password: sahary_pass"
echo ""
echo "  Redis: localhost:6379"
echo ""
echo -e "${YELLOW}🔧 Management Tools:${NC}"
echo "  pgAdmin: http://localhost:8080 (admin@saharycloud.com / admin123)"
echo "  Redis Commander: http://localhost:8081"
echo ""
echo -e "${YELLOW}👤 Default Users:${NC}"
echo "  Admin: admin@saharycloud.com / admin123!@#"
echo "  Demo: demo@saharycloud.com / demo123"
echo ""
echo -e "${GREEN}🚀 You can now start the development server with: npm run dev${NC}"