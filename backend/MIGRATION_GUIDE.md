# PostgreSQL Migration Guide

## ✅ Changes Made

1. **Updated `prisma/schema.prisma`**
   - Changed provider from `sqlite` to `postgresql`

2. **Updated `.env`**
   - Changed DATABASE_URL from SQLite to PostgreSQL connection string
   - New: `postgresql://sahary_user:sahary_pass@localhost:5432/sahary_cloud`

## 🚀 Migration Steps

### Step 1: Start PostgreSQL Container

```bash
cd backend

# Start PostgreSQL (and Redis) containers
docker-compose -f docker-compose.dev.yml up -d postgres redis

# Wait 10 seconds for PostgreSQL to initialize
sleep 10

# Check if containers are running
docker-compose -f docker-compose.dev.yml ps
```

### Step 2: Run Prisma Migration

```bash
# Generate Prisma client
npx prisma generate

# Create and apply migration
npx prisma migrate dev --name init_postgresql

# This will:
# - Create migration files
# - Apply schema to PostgreSQL
# - Generate Prisma client
```

### Step 3: (Optional) Seed Database

```bash
# Run seed script to populate initial data
npm run prisma:seed
```

### Step 4: Verify Migration

```bash
# Open Prisma Studio to verify tables
npx prisma studio

# Or check database directly
docker exec -it sahary-postgres psql -U sahary_user -d sahary_cloud -c "\dt"
```

### Step 5: Start Backend Server

```bash
# Start the backend
npm run dev

# Check health endpoint
curl http://localhost:3000/health
```

## 🔧 Troubleshooting

### Docker Permission Issues

If you get permission denied errors:

```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and log back in, or run:
newgrp docker

# Then retry the docker commands
```

### PostgreSQL Connection Issues

If migration fails with connection error:

```bash
# Check if PostgreSQL is running
docker-compose -f docker-compose.dev.yml logs postgres

# Restart PostgreSQL
docker-compose -f docker-compose.dev.yml restart postgres

# Wait and retry migration
sleep 10
npx prisma migrate dev --name init_postgresql
```

### Port Already in Use

If port 5432 is already in use:

```bash
# Check what's using the port
sudo lsof -i :5432

# Stop existing PostgreSQL
sudo systemctl stop postgresql

# Or change port in docker-compose.dev.yml
```

## 📊 Data Migration (If you have existing SQLite data)

If you need to migrate existing data from SQLite:

```bash
# 1. Export data from SQLite
npx prisma db pull --schema=prisma/schema.sqlite.prisma

# 2. Use a migration tool or write custom script
# Example: backend/scripts/migrate-sqlite-to-postgres.js

# 3. Or manually export/import critical data
```

## ✅ Verification Checklist

- [ ] PostgreSQL container is running
- [ ] Migration completed without errors
- [ ] All tables created in PostgreSQL
- [ ] Prisma client generated
- [ ] Backend server starts successfully
- [ ] Health endpoint shows database: healthy
- [ ] Can create/read/update/delete records

## 🎯 Quick Start (All-in-One)

```bash
cd backend

# Start services
docker-compose -f docker-compose.dev.yml up -d

# Wait for PostgreSQL
sleep 10

# Run migration
npx prisma generate
npx prisma migrate dev --name init_postgresql

# Seed database (optional)
npm run prisma:seed

# Start backend
npm run dev
```

## 📝 Notes

- PostgreSQL credentials are in `docker-compose.dev.yml`
- Database: `sahary_cloud`
- User: `sahary_user`
- Password: `sahary_pass`
- Port: `5432`

- For production, use environment variables for credentials
- Enable SSL for production PostgreSQL connections
- Set up automated backups for production database
