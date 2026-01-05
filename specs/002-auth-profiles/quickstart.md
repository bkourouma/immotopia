# Quickstart: Auth & Profiles

## Setup

1. **Environment Variables**:
   ```env
   GOOGLE_CLIENT_ID=...
   JWT_SECRET=...
   ```
2. **Database**:
   ```bash
   npx prisma migrate dev
   ```

## Key Flows

### 1. Registering a Visitor as a Tenant Client

```typescript
// POST /auth/register
{
  "email": "visitor@example.com",
  "password": "securePass123!",
  "tenantSlug": "agency-paris-sud" // Optional: immediately link to tenant
}
```

### 2. Switching Tenant Context (Frontend)

To switch the active tenant, navigate the user to the tenant-scoped URL. The generic `/me` endpoint returns all available tenant access.

```typescript
// GET /me response
{
  "user": { "id": "...", "email": "..." },
  "collaborations": [{ "tenant": { "slug": "agency-a" }, "role": "AGENT" }],
  "clientProfiles": [{ "tenant": { "slug": "agency-b" }, "type": "RENTER" }]
}
```

## Testing

- run `npm test` in `packages/api` to verify auth flows.
- Use `seeds/seed-users.ts` to create a SuperAdmin and default Tenant.
