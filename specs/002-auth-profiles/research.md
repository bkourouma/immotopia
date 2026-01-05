# Research: Auth Profiles & Multi-Tenancy

**Feature**: `002-auth-profiles`
**Date**: 2025-12-09

## Decisions

### 1. Google OAuth Strategy
- **Decision**: Use `google-auth-library` to verify ID tokens on the backend, while handling the OAuth flow on the client-side (React).
- **Rationale**:
  - The project separates Frontend (React) and Backend (API).
  - "Server-side web app" flow (Passport.js) often complicates CORS/cookies in decoupled architectures.
  - Client-side flow (using Google Identity Services SDK) obtains an `id_token`, which the API simply verifies using `google-auth-library`. This is stateless and robust.
- **Alternatives Considered**:
  - `passport-google-oauth20`: Good for traditional SSR, but heavier setup for a pure API.
  - Custom HTTP requests: Error-prone and security risks.

### 2. URL-based Multi-tenancy Routing
- **Decision**: Use React Router with a root layout path parameter: `path="/app/:slug/*"`. Use Express Middleware to extract `slug` from headers or distinct API routes.
- **Rationale**:
  - React Router v6 supports dynamic path parameters easily.
  - Backend API should remain RESTful. The frontend will map the URL slug to the `tenantId` (or pass the slug in `X-Tenant-Slug` header) for API calls.
  - This keeps the API cleaner (no `/api/:slug/users`) and lets middleware handle the resolution context.
- **Implementation Note**:
  - Frontend: `const { slug } = useParams();` -> fetch tenant config -> set context.
  - Backend: `req.headers['x-tenant-slug']` -> middleware finds Tenant -> sets `req.tenant` -> routes use `req.tenant.id`.

## Integration patterns

- **Auth Linking**:
  - When Google Login provides an email that exists in DB (password user), trust Google (verified) and link the account.
  - Store `googleId` in User table (or separate `AuthProvider` table if expecting more providers later). Given the prompt says "Email + Google", a simple column `googleId` on `User` is sufficient for MVP, but a separate table is cleaner for future-proofing. **Decision: Separate `IdentityProviders` or `AccountLinking` table not strictly necessary if only 2 methods, but `User` needs nullable `passwordHash` (for Google-only users).**

## Outstanding Risks

- **Tenant Slug Collision**: Need to ensure slugs are unique & url-safe.
- **Session Security**: If we use JWT, ensure the payload or lookup includes the current `tenantId` context if the token is tenant-scoped, OR keep the token global and check access per request. **Decision: Global User Token + Per-Request Tenant Context Header**. This allows one login to access multiple tenants without re-authenticating.

