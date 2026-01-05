# Research: Authentication & Login Module

**Feature**: 1-auth-login  
**Date**: 2025-11-12  
**Purpose**: Document technology decisions and rationale for authentication implementation

---

## Technology Decisions

### 1. Email Service Provider

**Decision**: Use **Nodemailer with SMTP** for development, with support for **SendGrid** or **AWS SES** for production.

**Rationale**:
- **Nodemailer** is the de-facto standard for Node.js email sending, supporting multiple transports (SMTP, SendGrid, AWS SES, Mailgun)
- **Flexibility**: Can start with SMTP (local development, testing) and switch to SendGrid/AWS SES (production) without code changes
- **Cost-effective**: SMTP is free for development, SendGrid offers 100 free emails/day, AWS SES is pay-per-use
- **Reliability**: SendGrid and AWS SES have high deliverability rates and built-in analytics
- **French support**: Both services support international characters and HTML templates

**Alternatives Considered**:
- **Mailgun**: Similar to SendGrid, but Nodemailer provides abstraction layer
- **Direct SMTP only**: Not suitable for production (deliverability issues, IP reputation)
- **Resend**: Modern alternative but less mature ecosystem

**Implementation**:
```typescript
// Use Nodemailer with transport configuration
// Development: SMTP (Mailtrap or local)
// Production: SendGrid or AWS SES via Nodemailer transport
```

**References**:
- [Nodemailer Documentation](https://nodemailer.com/about/)
- [SendGrid Node.js SDK](https://github.com/sendgrid/sendgrid-nodejs)
- [AWS SES with Nodemailer](https://nodemailer.com/transports/ses/)

---

### 2. JWT Library

**Decision**: Use **jsonwebtoken** library for JWT generation and validation.

**Rationale**:
- **Industry standard**: Most widely used JWT library for Node.js (10M+ weekly downloads)
- **Comprehensive**: Supports all JWT features (signing, verification, expiration, custom claims)
- **Type-safe**: Excellent TypeScript support with @types/jsonwebtoken
- **Security**: Supports RS256 (RSA) and HS256 (HMAC) algorithms
- **Performance**: Lightweight and fast
- **Maintenance**: Actively maintained with regular security updates

**Alternatives Considered**:
- **jose**: Modern alternative with better TypeScript support, but less adoption
- **jwt-simple**: Simpler but lacks advanced features
- **fast-jwt**: Fast but less feature-rich

**Implementation**:
```typescript
// Access token: HS256 (symmetric, fast)
// Refresh token: Stored in database (no JWT for refresh tokens)
// Claims: { userId, email, role, iat, exp }
```

**References**:
- [jsonwebtoken NPM](https://www.npmjs.com/package/jsonwebtoken)
- [JWT Best Practices (RFC 8725)](https://tools.ietf.org/html/rfc8725)

---

### 3. Password Hashing

**Decision**: Use **bcrypt** library with salt factor 12.

**Rationale**:
- **Industry standard**: Most widely used password hashing library (20M+ weekly downloads)
- **Security**: Adaptive hashing algorithm (bcrypt) with configurable work factor
- **Salt factor 12**: Balance between security and performance (recommended: 10-14)
- **Type-safe**: Excellent TypeScript support
- **Future-proof**: Can migrate to Argon2 later if needed (via bcryptjs or separate library)

**Alternatives Considered**:
- **Argon2**: More secure but requires native compilation, less widely supported
- **scrypt**: Good alternative but bcrypt is more established
- **bcryptjs**: Pure JavaScript implementation, slower but no native dependencies

**Implementation**:
```typescript
// Hash password: bcrypt.hash(password, 12)
// Compare password: bcrypt.compare(password, hash)
// Minimum 8 characters, uppercase, lowercase, number, special char
```

**References**:
- [bcrypt NPM](https://www.npmjs.com/package/bcrypt)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

---

### 4. Input Validation

**Decision**: Use **Zod** for schema-based validation.

**Rationale**:
- **Type-safe**: Zod schemas can infer TypeScript types automatically
- **Comprehensive**: Supports all validation needs (strings, emails, passwords, custom rules)
- **Developer-friendly**: Clean API, excellent error messages
- **Runtime validation**: Validates at runtime (critical for API security)
- **Composable**: Can combine schemas for complex validation
- **Growing adoption**: Rapidly becoming standard for TypeScript projects

**Alternatives Considered**:
- **class-validator**: Popular but requires classes, less type-safe
- **Joi**: Mature but less TypeScript-friendly
- **Yup**: Good alternative but Zod has better TypeScript integration
- **express-validator**: Good for Express but less reusable

**Implementation**:
```typescript
// Define Zod schemas for request validation
// Infer TypeScript types from schemas
// Validate in middleware before controller
```

**References**:
- [Zod Documentation](https://zod.dev/)
- [Zod NPM](https://www.npmjs.com/package/zod)

---

### 5. Rate Limiting

**Decision**: Use **express-rate-limit** for rate limiting on authentication endpoints.

**Rationale**:
- **Express integration**: Designed specifically for Express.js
- **Configurable**: Supports multiple store backends (memory, Redis)
- **Brute force protection**: Perfect for login endpoint (5 attempts per 15 minutes)
- **Flexible**: Can configure different limits for different endpoints
- **Lightweight**: Minimal overhead, works out of the box

**Alternatives Considered**:
- **Redis-based rate limiting**: More scalable but requires Redis infrastructure
- **Custom implementation**: Not recommended (security-sensitive, error-prone)
- **rate-limiter-flexible**: More features but overkill for this use case

**Implementation**:
```typescript
// Login endpoint: 5 attempts per 15 minutes per IP
// Registration endpoint: 3 attempts per hour per IP
// Password reset: 3 attempts per hour per IP
// Store in memory for development, Redis for production (optional)
```

**References**:
- [express-rate-limit NPM](https://www.npmjs.com/package/express-rate-limit)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

### 6. Token Storage (Refresh Tokens)

**Decision**: Store refresh tokens in **PostgreSQL database** (not in JWT).

**Rationale**:
- **Revocability**: Can revoke refresh tokens immediately (critical for security)
- **Audit trail**: Can track token usage, device information, revocation
- **Security**: Tokens stored as hashed values (not plaintext)
- **Scalability**: Database is the source of truth, supports multi-server deployments
- **Control**: Can implement device management, session limits, expiration policies

**Alternatives Considered**:
- **JWT refresh tokens**: Cannot revoke without blacklist (requires Redis/cache)
- **Redis storage**: Faster but adds infrastructure dependency, less durable
- **In-memory storage**: Not suitable for production (lost on server restart)

**Implementation**:
```typescript
// RefreshToken model in Prisma
// Fields: id, token (hashed), user_id, expires_at, revoked, device_info
// Hash token before storage (bcrypt or SHA-256)
// Validate token existence and revocation status on refresh
```

**References**:
- [JWT Refresh Token Best Practices](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/)
- [Prisma Documentation](https://www.prisma.io/docs)

---

### 7. Cookie Configuration

**Decision**: Use **HTTP-only, Secure, SameSite=Strict cookies** for token storage.

**Rationale**:
- **HTTP-only**: Prevents JavaScript access (XSS protection)
- **Secure**: Only sent over HTTPS (required for production)
- **SameSite=Strict**: Prevents CSRF attacks (no cross-site requests)
- **Path-based**: Set path to `/` for application-wide access
- **Expiration**: Set expiration based on refresh token expiry (7 days)

**Alternatives Considered**:
- **LocalStorage**: Not secure (XSS vulnerable), not recommended
- **SessionStorage**: Same issues as LocalStorage, plus session-only
- **Authorization header**: Requires manual token management, no automatic cookie handling

**Implementation**:
```typescript
// Access token cookie: httpOnly, secure, sameSite: 'strict', maxAge: 15 minutes
// Refresh token cookie: httpOnly, secure, sameSite: 'strict', maxAge: 7 days
// Use cookie-parser middleware in Express
```

**References**:
- [OWASP Secure Cookie Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html)
- [MDN Set-Cookie Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)

---

### 8. Frontend State Management

**Decision**: Use **React Context API** for authentication state management.

**Rationale**:
- **Built-in**: No external dependencies, part of React core
- **Simple**: Perfect for authentication state (user, tokens, loading)
- **Type-safe**: Excellent TypeScript support
- **Sufficient**: Authentication state is relatively simple (no complex state logic)
- **Performance**: Context API is performant for this use case (small state, infrequent updates)

**Alternatives Considered**:
- **Redux Toolkit**: Overkill for authentication state, adds complexity
- **Zustand**: Lightweight but Context API is sufficient
- **Recoil**: Too complex for this use case
- **Local state only**: Not suitable (needs global access)

**Implementation**:
```typescript
// AuthContext with: user, isAuthenticated, isLoading, login, logout, refreshToken
// useAuth hook for components to access auth state
// Provider wraps application root
```

**References**:
- [React Context API Documentation](https://react.dev/reference/react/useContext)
- [React Context Best Practices](https://kentcdodds.com/blog/how-to-use-react-context-effectively)

---

### 9. API Client (Frontend)

**Decision**: Use **Axios** for HTTP requests with interceptors for token refresh.

**Rationale**:
- **Interceptors**: Perfect for automatic token refresh on 401 responses
- **Request/response transformation**: Easy to add authentication headers
- **Error handling**: Comprehensive error handling with try/catch
- **TypeScript support**: Excellent TypeScript support with generics
- **Widely adopted**: Industry standard for React applications

**Alternatives Considered**:
- **Fetch API**: Native but requires more boilerplate, no interceptors
- **ky**: Modern alternative but less adoption
- **superagent**: Older library, less maintained

**Implementation**:
```typescript
// Axios instance with baseURL and interceptors
// Request interceptor: Add access token from cookie
// Response interceptor: Handle 401, refresh token, retry request
// Automatic token refresh on expiration
```

**References**:
- [Axios Documentation](https://axios-http.com/docs/intro)
- [Axios Interceptors](https://axios-http.com/docs/interceptors)

---

### 10. UI Library

**Decision**: Use **Tailwind CSS** for styling (utility-first CSS framework).

**Rationale**:
- **Rapid development**: Utility classes enable fast UI development
- **Customizable**: Easy to customize colors, spacing, typography
- **Responsive**: Built-in responsive design utilities
- **Modern**: Industry standard for modern React applications
- **Type-safe**: Can use with TypeScript for type-safe class names
- **Performance**: Purges unused CSS in production

**Alternatives Considered**:
- **Material-UI (MUI)**: Component library, more opinionated, larger bundle size
- **Ant Design**: Component library, more features but heavier
- **Chakra UI**: Component library, good but Tailwind is more flexible
- **Styled Components**: CSS-in-JS, different paradigm

**Implementation**:
```typescript
// Use Tailwind CSS for all styling
// Custom theme configuration for brand colors
// Responsive design with mobile-first approach
// French typography and spacing
```

**References**:
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Tailwind CSS NPM](https://www.npmjs.com/package/tailwindcss)

---

## Security Considerations

### 1. Password Security
- **Hashing**: bcrypt with salt factor 12
- **Complexity**: Minimum 8 characters, uppercase, lowercase, number, special char
- **Storage**: Never store plaintext passwords, always hash before storage
- **Validation**: Client-side and server-side validation

### 2. Token Security
- **Access tokens**: Short-lived (15 minutes), stored in HTTP-only cookies
- **Refresh tokens**: Long-lived (7 days), stored in database, revocable
- **JWT secrets**: Minimum 256 bits, stored in environment variables
- **Token rotation**: Consider implementing refresh token rotation (future enhancement)

### 3. Brute Force Protection
- **Rate limiting**: 5 login attempts per 15 minutes per IP
- **Account lockout**: 30 minutes after 5 failed attempts
- **IP-based**: Track attempts by IP address (can be enhanced with user-based tracking)

### 4. CSRF Protection
- **SameSite cookies**: Strict mode prevents CSRF attacks
- **CORS**: Configure CORS properly (allow only frontend domain)
- **Origin validation**: Validate request origin in middleware

### 5. XSS Protection
- **HTTP-only cookies**: Prevents JavaScript access to tokens
- **Input sanitization**: Sanitize all user inputs
- **Content Security Policy**: Implement CSP headers (future enhancement)

---

## Performance Considerations

### 1. Database Indexing
- **User table**: Index on `email` (unique, frequent lookups)
- **RefreshToken table**: Index on `token` (lookup during refresh)
- **PasswordResetToken table**: Index on `token` (lookup during reset)
- **EmailVerificationToken table**: Index on `token` (lookup during verification)

### 2. Caching (Optional)
- **User lookups**: Cache user data in Redis (future enhancement)
- **Rate limiting**: Use Redis for distributed rate limiting (future enhancement)
- **Session data**: Cache session data in Redis (future enhancement)

### 3. Email Sending
- **Async processing**: Send emails asynchronously (queue system, future enhancement)
- **Batching**: Batch email sends for efficiency (future enhancement)
- **Retry logic**: Implement retry logic for failed email sends

---

## Testing Strategy

### 1. Backend Tests
- **Unit tests**: Test services, utilities, middleware (Jest)
- **Integration tests**: Test API endpoints (Jest + Supertest)
- **E2E tests**: Test complete authentication flows (Jest + Supertest)

### 2. Frontend Tests
- **Unit tests**: Test components, hooks, utilities (Jest + React Testing Library)
- **Integration tests**: Test page flows (Jest + React Testing Library)
- **E2E tests**: Test complete user flows (Puppeteer)

### 3. Security Tests
- **Penetration testing**: Test for common vulnerabilities (OWASP Top 10)
- **Token security**: Test token expiration, revocation, validation
- **Brute force**: Test rate limiting and account lockout
- **CSRF**: Test CSRF protection
- **XSS**: Test XSS protection

---

## Deployment Considerations

### 1. Environment Variables
- **JWT_SECRET**: Minimum 256 bits, unique per environment
- **REFRESH_TOKEN_SECRET**: Minimum 256 bits, unique per environment
- **DATABASE_URL**: PostgreSQL connection string
- **EMAIL_SERVICE_API_KEY**: SendGrid/AWS SES API key
- **FRONTEND_URL**: Frontend application URL
- **BACKEND_URL**: Backend API URL

### 2. HTTPS
- **Production**: HTTPS required for Secure cookies
- **Development**: HTTP acceptable for local development
- **SSL/TLS**: Use valid SSL certificates in production

### 3. Database Migrations
- **Prisma Migrate**: Use Prisma Migrate for database schema changes
- **Versioning**: Version all migrations
- **Rollback**: Test rollback procedures

---

## Future Enhancements

### 1. OAuth2 / Social Login
- **Google**: Google OAuth2 integration
- **Facebook**: Facebook OAuth2 integration
- **LinkedIn**: LinkedIn OAuth2 integration

### 2. Two-Factor Authentication (2FA)
- **TOTP**: Time-based one-time passwords (Google Authenticator, Authy)
- **SMS**: SMS-based 2FA
- **Email**: Email-based 2FA

### 3. Advanced Session Management
- **Multiple devices**: Track and manage multiple devices
- **Session history**: View session history
- **Remote logout**: Logout from other devices

### 4. Password Policies
- **Password history**: Prevent reuse of previous passwords
- **Password expiration**: Force password changes periodically
- **Password strength meter**: Real-time password strength indicator

---

## References

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [JWT Best Practices (RFC 8725)](https://tools.ietf.org/html/rfc8725)
- [Prisma Documentation](https://www.prisma.io/docs)
- [React Context API](https://react.dev/reference/react/useContext)
- [Axios Documentation](https://axios-http.com/docs/intro)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Nodemailer Documentation](https://nodemailer.com/about/)
- [bcrypt NPM](https://www.npmjs.com/package/bcrypt)
- [jsonwebtoken NPM](https://www.npmjs.com/package/jsonwebtoken)
- [Zod Documentation](https://zod.dev/)

---

**Research Status**: ✅ Complete - All technology decisions documented  
**Last Updated**: 2025-11-12

