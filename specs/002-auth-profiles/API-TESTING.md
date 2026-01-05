# API Testing Guide - Authentication & Profiles

This guide provides curl commands to test all implemented API endpoints.

## Prerequisites

1. Start the API server: `npm run dev` in `packages/api`
2. Ensure PostgreSQL is running
3. Base URL: `http://localhost:8000`

---

## 🔐 Authentication Endpoints

### 1. Register a New User

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456",
    "fullName": "Test User"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Inscription réussie ! Veuillez vérifier votre email.",
  "user": {
    "id": "...",
    "email": "test@example.com",
    "fullName": "Test User",
    "emailVerified": false
  }
}
```

### 2. Login

```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "email": "test@example.com",
    "password": "Test@123456"
  }'
```

**Note**: The `-c cookies.txt` flag saves cookies for authenticated requests.

### 3. Get Current User

```bash
curl -X GET http://localhost:8000/api/auth/me \
  -b cookies.txt
```

### 4. Refresh Token

```bash
curl -X POST http://localhost:8000/api/auth/refresh \
  -b cookies.txt \
  -c cookies.txt
```

### 5. Logout

```bash
curl -X POST http://localhost:8000/api/auth/logout \
  -b cookies.txt
```

### 6. Forgot Password

```bash
curl -X POST http://localhost:8000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com"
  }'
```

### 7. Reset Password

```bash
curl -X POST http://localhost:8000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "RESET_TOKEN_FROM_EMAIL",
    "newPassword": "NewTest@123456"
  }'
```

---

## 🏢 Tenant Management Endpoints

### 1. List All Active Tenants

```bash
curl -X GET http://localhost:8000/api/tenants
```

### 2. Create a Tenant (Super Admin Only)

First, create a super admin user or update an existing user in the database:
```sql
UPDATE users SET global_role = 'SUPER_ADMIN' WHERE email = 'test@example.com';
```

Then:
```bash
curl -X POST http://localhost:8000/api/tenants \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "Agence Immobilière Mali",
    "slug": "agence-mali",
    "type": "AGENCY",
    "website": "https://agence-mali.com"
  }'
```

### 3. Get Tenant by ID

```bash
curl -X GET http://localhost:8000/api/tenants/TENANT_ID
```

### 4. Get Tenant by Slug

```bash
curl -X GET http://localhost:8000/api/tenants/slug/agence-mali
```

### 5. Register as Tenant Client

```bash
curl -X POST http://localhost:8000/api/tenants/TENANT_ID/register \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "clientType": "RENTER",
    "details": {
      "budget": 50000,
      "preferredLocation": "Bamako",
      "moveInDate": "2025-01-01"
    }
  }'
```

**Client Types**: `OWNER`, `RENTER`, `BUYER`

### 6. Get My Tenant Memberships

```bash
curl -X GET http://localhost:8000/api/tenants/my-memberships \
  -b cookies.txt
```

### 7. Get Tenant Clients

```bash
curl -X GET http://localhost:8000/api/tenants/TENANT_ID/clients \
  -b cookies.txt
```

### 8. Update Client Details

```bash
curl -X PATCH http://localhost:8000/api/tenants/TENANT_ID/client-details \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "details": {
      "budget": 75000,
      "notes": "Looking for 3-bedroom apartment"
    }
  }'
```

### 9. Unregister from Tenant

```bash
curl -X DELETE http://localhost:8000/api/tenants/TENANT_ID/unregister \
  -b cookies.txt
```

---

## 👥 Collaborator Management Endpoints

### 1. Invite a Collaborator (Admin Only)

First, create a collaborator admin:
```sql
INSERT INTO collaborators (id, user_id, tenant_id, role) 
VALUES (gen_random_uuid(), 'USER_ID', 'TENANT_ID', 'ADMIN');
```

Then:
```bash
curl -X POST http://localhost:8000/api/collaborators/invite \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "email": "collaborator@example.com",
    "tenantId": "TENANT_ID",
    "role": "AGENT"
  }'
```

**Roles**: `ADMIN`, `MANAGER`, `AGENT`

### 2. Accept Collaborator Invitation

```bash
curl -X POST http://localhost:8000/api/collaborators/accept-invite \
  -H "Content-Type: application/json" \
  -d '{
    "token": "INVITE_TOKEN",
    "password": "Collab@123456",
    "fullName": "New Collaborator"
  }'
```

### 3. Get Tenant Collaborators

```bash
curl -X GET http://localhost:8000/api/collaborators/tenant/TENANT_ID \
  -b cookies.txt
```

### 4. Get My Collaborator Profile

```bash
curl -X GET http://localhost:8000/api/collaborators/my-profile/TENANT_ID \
  -b cookies.txt
```

### 5. Update Collaborator Role (Admin Only)

```bash
curl -X PATCH http://localhost:8000/api/collaborators/COLLABORATOR_ID/role \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "role": "MANAGER"
  }'
```

### 6. Remove Collaborator (Admin Only)

```bash
curl -X DELETE http://localhost:8000/api/collaborators/COLLABORATOR_ID \
  -b cookies.txt
```

---

## 🧪 Testing Workflow Example

### Complete Flow: User Registration → Tenant Client → Collaborator

```bash
# Step 1: Register a user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"John@123456","fullName":"John Doe"}'

# Step 2: Login (save cookies)
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -c john-cookies.txt \
  -d '{"email":"john@example.com","password":"John@123456"}'

# Step 3: Create a tenant (requires SUPER_ADMIN role)
# First, update user role in database:
# UPDATE users SET global_role = 'SUPER_ADMIN' WHERE email = 'john@example.com';

curl -X POST http://localhost:8000/api/tenants \
  -H "Content-Type: application/json" \
  -b john-cookies.txt \
  -d '{
    "name": "Mali Real Estate",
    "slug": "mali-realestate",
    "type": "AGENCY"
  }'

# Step 4: Get tenant ID from response, then register another user as client
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"Jane@123456","fullName":"Jane Doe"}'

curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -c jane-cookies.txt \
  -d '{"email":"jane@example.com","password":"Jane@123456"}'

curl -X POST http://localhost:8000/api/tenants/TENANT_ID/register \
  -H "Content-Type: application/json" \
  -b jane-cookies.txt \
  -d '{
    "clientType": "RENTER",
    "details": {"budget": 50000}
  }'

# Step 5: Invite a collaborator
curl -X POST http://localhost:8000/api/collaborators/invite \
  -H "Content-Type: application/json" \
  -b john-cookies.txt \
  -d '{
    "email": "agent@example.com",
    "tenantId": "TENANT_ID",
    "role": "AGENT"
  }'
```

---

## 🔍 Testing Tips

1. **Check Server Logs**: Watch the console output for detailed error messages and logger info

2. **Verify Database**: Query the database to confirm data was created:
   ```sql
   SELECT * FROM users;
   SELECT * FROM tenants;
   SELECT * FROM collaborators;
   SELECT * FROM tenant_clients;
   ```

3. **Test Authentication**: Always verify that protected endpoints return 401 without cookies

4. **Test Authorization**: Verify that non-admin users cannot access admin-only endpoints

5. **Test Data Isolation**: Ensure users can only access tenants they're associated with

---

## 📝 Common Issues

### Issue: "Email ou mot de passe incorrect"
- Check that the user's email is verified (`email_verified = true` in database)
- For testing, you can manually verify: `UPDATE users SET email_verified = true WHERE email = 'test@example.com';`

### Issue: "Tenant ID requis"
- Make sure the tenantId is in the URL path for tenant-specific endpoints

### Issue: "Seul un administrateur peut..."
- Ensure the user is a collaborator with ADMIN role for that tenant

### Issue: Cookies not saved
- Make sure to use `-c cookies.txt` to save and `-b cookies.txt` to send cookies
- Check that `httpOnly` cookies are being set in responses

---

## 🎯 Quick Test Commands

Health check:
```bash
curl http://localhost:8000/health
```

Test authentication required:
```bash
curl http://localhost:8000/api/auth/me
# Should return 401
```

Test with authentication:
```bash
curl http://localhost:8000/api/auth/me -b cookies.txt
# Should return user data
```

