# Authentication API Documentation

## Overview

The Authentication API provides comprehensive user authentication, authorization, and account management functionality for the Sahary Cloud platform. All endpoints are secured with rate limiting, input validation, and various security measures.

## Base URL

```
http://localhost:3000/api/v1/auth
```

## Authentication

Most endpoints require a valid JWT token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Rate Limiting

- **Auth endpoints** (login, register, etc.): 5 requests per 15 minutes
- **API endpoints**: 60 requests per minute
- **General endpoints**: 20 requests per 15 minutes

## Response Format

All responses follow this format:

```json
{
  "success": true|false,
  "message": "Human readable message",
  "data": {}, // Response data (if applicable)
  "error": "Error type", // Only on errors
  "timestamp": "2024-01-01T00:00:00.000Z" // Only on errors
}
```

## Endpoints

### 1. User Registration

**POST** `/register`

Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890" // Optional
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER",
      "isActive": true,
      "isVerified": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "jwt-access-token",
      "refreshToken": "jwt-refresh-token",
      "tokenType": "Bearer",
      "expiresIn": 1640995200
    },
    "emailVerificationRequired": true
  }
}
```

### 2. User Login

**POST** `/login`

Authenticate user and return tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER",
      "isActive": true,
      "isVerified": true,
      "lastLoginAt": "2024-01-01T00:00:00.000Z"
    },
    "tokens": {
      "accessToken": "jwt-access-token",
      "tokenType": "Bearer",
      "expiresIn": 1640995200
    },
    "emailVerificationRequired": false
  }
}
```

### 3. Token Refresh

**POST** `/refresh`

Refresh an expired access token using a refresh token.

**Request Body:**
```json
{
  "refreshToken": "jwt-refresh-token"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "new-jwt-access-token",
    "tokenType": "Bearer",
    "expiresIn": 1640995200
  }
}
```

### 4. Logout

**POST** `/logout`

**Headers:** `Authorization: Bearer <token>`

Logout user and invalidate token.

**Response (200):**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

### 5. Get Profile

**GET** `/profile`

**Headers:** `Authorization: Bearer <token>`

Get current user profile information.

**Response (200):**
```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890",
      "role": "USER",
      "isActive": true,
      "isVerified": true,
      "lastLoginAt": "2024-01-01T00:00:00.000Z",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### 6. Update Profile

**PUT** `/profile`

**Headers:** `Authorization: Bearer <token>`

Update user profile information.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "phone": "+1234567890",
  "avatar": "https://example.com/avatar.jpg"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Smith",
      "phone": "+1234567890",
      "avatar": "https://example.com/avatar.jpg",
      "role": "USER",
      "isActive": true,
      "isVerified": true,
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### 7. Change Password

**POST** `/change-password`

**Headers:** `Authorization: Bearer <token>`

Change user password (requires email verification).

**Request Body:**
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

### 8. Forgot Password

**POST** `/forgot-password`

Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset link has been sent to your email"
}
```

### 9. Reset Password

**POST** `/reset-password`

Reset password using reset token.

**Request Body:**
```json
{
  "token": "password-reset-token",
  "password": "NewPassword123!",
  "confirmPassword": "NewPassword123!"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully"
}
```

### 10. Verify Email

**POST** `/verify-email`

Verify email address using verification token.

**Request Body:**
```json
{
  "token": "email-verification-token"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "isVerified": true
    }
  }
}
```

### 11. Resend Verification

**POST** `/resend-verification`

Resend email verification.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Verification email has been resent"
}
```

### 12. Validate Token

**POST** `/validate-token`

Validate a JWT token without full authentication.

**Request Body:**
```json
{
  "token": "jwt-token-to-validate"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Token is valid",
  "valid": true,
  "user": {
    "userId": "user-id",
    "email": "user@example.com",
    "role": "USER",
    "isVerified": true
  },
  "expiresAt": "2024-01-01T00:00:00.000Z"
}
```

### 13. Get Permissions

**GET** `/permissions`

**Headers:** `Authorization: Bearer <token>`

Get user permissions based on role.

**Response (200):**
```json
{
  "success": true,
  "message": "Permissions retrieved successfully",
  "data": {
    "role": "USER",
    "permissions": [
      "profile:read",
      "profile:update",
      "vm:create",
      "vm:read:own",
      "billing:read:own"
    ],
    "permissionCount": 5
  }
}
```

### 14. Check Authentication

**GET** `/check`

**Headers:** `Authorization: Bearer <token>`

Check if user is authenticated and token is valid.

**Response (200):**
```json
{
  "success": true,
  "message": "Authentication valid",
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "USER",
      "isActive": true,
      "isVerified": true
    },
    "authenticated": true
  }
}
```

### 15. Get User Activity

**GET** `/activity`

**Headers:** `Authorization: Bearer <token>`

Get user activity log with pagination and filtering.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `action` (optional): Filter by action type
- `startDate` (optional): Filter from date (ISO format)
- `endDate` (optional): Filter to date (ISO format)
- `sortBy` (optional): Sort field (timestamp, action, resource)
- `sortOrder` (optional): Sort order (asc, desc)

**Response (200):**
```json
{
  "success": true,
  "message": "Activity log retrieved successfully",
  "data": [
    {
      "id": "log-id",
      "action": "USER_LOGIN",
      "resource": "user",
      "resourceId": "user-id",
      "ipAddress": "192.168.1.1",
      "timestamp": "2024-01-01T00:00:00.000Z",
      "newValues": {
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0..."
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### 16. Get Sessions

**GET** `/sessions`

**Headers:** `Authorization: Bearer <token>`

Get user active sessions.

**Response (200):**
```json
{
  "success": true,
  "message": "Sessions retrieved successfully",
  "data": {
    "sessions": []
  }
}
```

### 17. Revoke All Sessions

**DELETE** `/sessions`

**Headers:** `Authorization: Bearer <token>`

Revoke all user sessions (logout from all devices).

**Response (200):**
```json
{
  "success": true,
  "message": "All sessions revoked successfully"
}
```

### 18. Revoke Specific Session

**DELETE** `/sessions/:sessionId`

**Headers:** `Authorization: Bearer <token>`

Revoke a specific session.

**Response (200):**
```json
{
  "success": true,
  "message": "Session revoked successfully",
  "sessionId": "session-id"
}
```

### 19. Impersonate User (Super Admin Only)

**POST** `/impersonate`

**Headers:** `Authorization: Bearer <super-admin-token>`

Impersonate another user (Super Admin only).

**Request Body:**
```json
{
  "targetUserId": "target-user-id",
  "reason": "Support assistance" // Optional
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Impersonation started successfully",
  "data": {
    "impersonationToken": "impersonation-jwt-token",
    "targetUser": {
      "id": "target-user-id",
      "email": "target@example.com",
      "firstName": "Target",
      "lastName": "User",
      "role": "USER"
    },
    "impersonatedBy": {
      "id": "admin-id",
      "email": "admin@example.com"
    }
  }
}
```

### 20. Stop Impersonation

**POST** `/stop-impersonation`

**Headers:** `Authorization: Bearer <impersonation-token>`

Stop impersonating user and return to original admin account.

**Response (200):**
```json
{
  "success": true,
  "message": "Impersonation stopped successfully",
  "data": {
    "originalToken": "admin-jwt-token",
    "originalUser": {
      "id": "admin-id",
      "email": "admin@example.com",
      "firstName": "Admin",
      "lastName": "User",
      "role": "SUPER_ADMIN"
    }
  }
}
```

### 21. Deactivate Account

**POST** `/deactivate`

**Headers:** `Authorization: Bearer <token>`

Deactivate user account (requires email verification).

**Request Body:**
```json
{
  "password": "CurrentPassword123!",
  "reason": "No longer need the service" // Optional
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Account deactivated successfully"
}
```

### 22. Reactivate Account

**POST** `/reactivate`

Reactivate a deactivated account using reactivation token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "token": "reactivation-token"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Account reactivated successfully"
}
```

### 23. Health Check

**GET** `/health`

Check API health status.

**Response (200):**
```json
{
  "success": true,
  "message": "Auth routes are healthy",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Error Responses

### Validation Error (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "email",
      "message": "Invalid email format",
      "code": "invalid_string",
      "received": "invalid-email"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Authentication Error (401)
```json
{
  "success": false,
  "error": "Authentication required",
  "message": "No valid authorization header provided",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Authorization Error (403)
```json
{
  "success": false,
  "error": "Insufficient permissions",
  "message": "This action requires admin privileges",
  "requiredRoles": ["ADMIN", "SUPER_ADMIN"],
  "userRole": "USER",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Rate Limit Error (429)
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "message": "Too many authentication attempts, please try again later",
  "retryAfter": 900,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Internal Server Error",
  "message": "An unexpected error occurred",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Security Features

### Rate Limiting
- Different limits for different endpoint types
- IP-based and user-based limiting
- Brute force protection for login attempts

### Input Validation
- Comprehensive validation using Zod schemas
- Input sanitization to prevent XSS
- SQL injection protection

### Token Security
- JWT tokens with expiration
- Token blacklisting on logout
- Refresh token rotation

### Password Security
- Strong password requirements
- bcrypt hashing with configurable rounds
- Password strength validation

### Audit Logging
- All authentication events logged
- User activity tracking
- Admin action logging

## Usage Examples

### JavaScript/Node.js
```javascript
// Register user
const registerResponse = await fetch('/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'StrongPassword123!',
    firstName: 'John',
    lastName: 'Doe'
  })
});

// Login user
const loginResponse = await fetch('/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'StrongPassword123!'
  })
});

const { data } = await loginResponse.json();
const token = data.tokens.accessToken;

// Get profile
const profileResponse = await fetch('/api/v1/auth/profile', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### cURL Examples
```bash
# Register user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "StrongPassword123!",
    "firstName": "John",
    "lastName": "Doe"
  }'

# Login user
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "StrongPassword123!"
  }'

# Get profile (replace TOKEN with actual token)
curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer TOKEN"
```