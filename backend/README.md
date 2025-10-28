# Sahary Cloud Backend

Backend API for Sahary Cloud - Solar-powered VPS and hosting platform.

## 🌟 Features

- **Authentication & Authorization** - JWT-based auth with role-based access control
- **VM Management** - Create, manage, and monitor virtual machines
- **Billing System** - Usage tracking and automated invoicing
- **Admin Dashboard** - Comprehensive admin panel with analytics
- **Solar Energy Monitoring** - Real-time solar energy tracking and environmental impact
- **Security** - Rate limiting, input validation, and comprehensive security measures

## 🛠 Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Cache/Sessions:** Redis
- **Authentication:** JWT + bcrypt
- **Validation:** Joi/Zod
- **Testing:** Jest + Supertest
- **Containerization:** Docker
- **Payment:** Stripe integration
- **Email:** Nodemailer

## 📁 Project Structure

```
backend/
├── src/
│   ├── controllers/     # API controllers
│   ├── services/        # Business logic
│   ├── models/          # Data models
│   ├── routes/          # API routes
│   ├── middlewares/     # Custom middleware
│   ├── utils/           # Helper utilities
│   └── index.js         # Application entry point
├── prisma/
│   └── schema.prisma    # Database schema
├── tests/               # Test files
├── logs/                # Application logs
└── uploads/             # File uploads
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 13+
- Redis 6+
- Docker (optional)

### Installation

1. **Clone and navigate to backend:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Setup environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Setup database:**
   ```bash
   # Make sure PostgreSQL is running
   npm run prisma:migrate
   npm run prisma:generate
   ```

5. **Start development server:**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api/v1
```

### Health Check
```
GET /health
```

### Authentication Endpoints
```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/logout
POST /api/v1/auth/refresh
```

### VM Management
```
GET    /api/v1/vms
POST   /api/v1/vms
GET    /api/v1/vms/:id
PUT    /api/v1/vms/:id
DELETE /api/v1/vms/:id
POST   /api/v1/vms/:id/start
POST   /api/v1/vms/:id/stop
```

### Billing
```
GET /api/v1/billing/invoices
GET /api/v1/billing/usage
POST /api/v1/billing/pay/:id
```

### Admin (Admin only)
```
GET /api/v1/admin/users
GET /api/v1/admin/stats
PUT /api/v1/admin/users/:id/status
```

### Solar Energy
```
GET /api/v1/solar/status
GET /api/v1/solar/production
GET /api/v1/solar/environmental-impact
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## 🔧 Development

### Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio

### Environment Variables

Key environment variables (see `.env.example` for full list):

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/sahary_cloud
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret
STRIPE_SECRET_KEY=your-stripe-key
```

## 🐳 Docker

```bash
# Build image
docker build -t sahary-cloud-backend .

# Run with docker-compose
docker-compose up -d
```

## 📊 Monitoring & Logging

- **Logs:** Winston logger with daily rotation
- **Health Check:** `/health` endpoint
- **Metrics:** Built-in performance monitoring
- **Error Tracking:** Comprehensive error handling

## 🔒 Security Features

- **Rate Limiting:** Configurable request limits
- **CORS:** Cross-origin resource sharing protection
- **Helmet:** Security headers
- **Input Validation:** Request validation and sanitization
- **JWT Authentication:** Secure token-based auth
- **Password Hashing:** bcrypt with configurable rounds

## 🌱 Environmental Impact

Sahary Cloud is powered by solar energy, making it an eco-friendly hosting solution. The platform tracks:

- Solar energy production and consumption
- Carbon footprint reduction
- Environmental impact metrics
- Energy efficiency reports

## 📝 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📞 Support

For support and questions:
- Email: support@saharycloud.com
- Documentation: [docs.saharycloud.com](https://docs.saharycloud.com)
- Issues: GitHub Issues