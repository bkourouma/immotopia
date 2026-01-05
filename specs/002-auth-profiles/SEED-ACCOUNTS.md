# 🌱 Database Seed - Test Accounts

## ✅ Seed Completed Successfully!

The database has been populated with test data for development and testing.

---

## 🔑 **Login Credentials**

**Password for ALL accounts**: `Test@123456`

---

## 👥 **Users Created**

### 1. 👤 **Visitor** (No Tenant Affiliation)
- **Email**: `visitor@immobillier.com`
- **Name**: Visiteur Non Lié
- **Role**: USER (no tenant links)
- **Use Case**: Test user registration and basic authentication

### 2. 🔐 **Admin 1** @ Agence Immobilière du Mali
- **Email**: `admin1@agence-mali.com`  
- **Name**: Amadou Koné
- **Tenant**: Agence Immobilière du Mali
- **Role**: ADMIN
- **Use Case**: Test admin functions, team management, invite collaborators

### 3. 🔐 **Admin 2** @ Bamako Immobilier
- **Email**: `admin2@bamako-immo.com`
- **Name**: Fatima Traoré
- **Tenant**: Bamako Immobilier
- **Role**: ADMIN
- **Use Case**: Test multi-tenant isolation, cross-tenant access prevention

### 4. 👔 **Collaborator (Agent)** @ Agence Mali
- **Email**: `agent@agence-mali.com`
- **Name**: Moussa Diarra
- **Tenant**: Agence Immobilière du Mali
- **Role**: AGENT
- **Use Case**: Test collaborator permissions, RBAC enforcement

### 5. 🏠 **Propriétaire (Owner)** @ Agence Mali
- **Email**: `proprietaire@gmail.com`
- **Name**: Ibrahim Sanogo
- **Tenant**: Agence Immobilière du Mali
- **Client Type**: OWNER
- **Details**:
  - Property Count: 3
  - Total Value: 150,000,000 FCFA
  - Locations: Bamako, Koulikoro
  - Preferred Contact: Phone
- **Use Case**: Test owner/landlord client features

### 6. 🏘️ **Locataire (Renter)** @ Bamako Immo
- **Email**: `locataire@gmail.com`
- **Name**: Mariam Coulibaly
- **Tenant**: Bamako Immobilier
- **Client Type**: RENTER
- **Details**:
  - Budget: 75,000 FCFA/month
  - Preferred Location: Bamako, Hamdallaye
  - Move-in Date: 2025-02-01
  - Property Type: Apartment
  - Bedrooms: 3
  - Notes: Recherche appartement 3 chambres avec parking
- **Use Case**: Test renter client features

---

## 🏢 **Tenants Created**

### 1. Agence Immobilière du Mali
- **Name**: Agence Immobilière du Mali
- **Slug**: `agence-mali`
- **Type**: AGENCY
- **Website**: https://agence-mali.com
- **Team Members**:
  - Amadou Koné (ADMIN)
  - Moussa Diarra (AGENT)
- **Clients**:
  - Ibrahim Sanogo (OWNER)

### 2. Bamako Immobilier
- **Name**: Bamako Immobilier
- **Slug**: `bamako-immo`
- **Type**: AGENCY
- **Website**: https://bamako-immo.com
- **Team Members**:
  - Fatima Traoré (ADMIN)
- **Clients**:
  - Mariam Coulibaly (RENTER)

---

## 🧪 **Testing Scenarios**

### Authentication Tests
```bash
# Test visitor login
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"visitor@immobillier.com","password":"Test@123456"}'

# Test admin login
curl -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -c admin1-cookies.txt \
  -d '{"email":"admin1@agence-mali.com","password":"Test@123456"}'
```

### Multi-Tenant Tests
```bash
# Admin 1 viewing their team
curl -X GET http://localhost:8001/api/collaborators/tenant/TENANT1_ID \
  -b admin1-cookies.txt

# Admin 2 should NOT be able to view Tenant 1's team (403)
curl -X GET http://localhost:8001/api/collaborators/tenant/TENANT1_ID \
  -b admin2-cookies.txt
```

### RBAC Tests
```bash
# Admin can invite collaborators
curl -X POST http://localhost:8001/api/collaborators/invite \
  -H "Content-Type: application/json" \
  -b admin1-cookies.txt \
  -d '{"email":"new@example.com","tenantId":"TENANT1_ID","role":"AGENT"}'

# Agent CANNOT invite collaborators (403)
curl -X POST http://localhost:8001/api/collaborators/invite \
  -H "Content-Type: application/json" \
  -b agent-cookies.txt \
  -d '{"email":"new@example.com","tenantId":"TENANT1_ID","role":"AGENT"}'
```

### Client Registration Tests
```bash
# Visitor can register as a client
curl -X POST http://localhost:8001/api/tenants/TENANT1_ID/register \
  -H "Content-Type: application/json" \
  -b visitor-cookies.txt \
  -d '{"clientType":"BUYER","details":{"budget":100000}}'
```

---

## 📊 **Database Summary**

- **Users**: 6
- **Tenants**: 2
- **Collaborators**: 3 (2 admins + 1 agent)
- **Tenant Clients**: 2 (1 owner + 1 renter)
- **Total Relationships**: 5

---

## 🔄 **Reseed Database**

To clear and reseed the database at any time:

```bash
cd packages/api
npm run db:seed
```

This will:
1. ✅ Delete all existing data
2. ✅ Create fresh test accounts
3. ✅ Set up tenant relationships
4. ✅ Ready for testing

---

## 📝 **Quick Login Reference**

| Email | Password | Role | Tenant |
|-------|----------|------|--------|
| visitor@immobillier.com | Test@123456 | Visitor | None |
| admin1@agence-mali.com | Test@123456 | Admin | Agence Mali |
| admin2@bamako-immo.com | Test@123456 | Admin | Bamako Immo |
| agent@agence-mali.com | Test@123456 | Agent | Agence Mali |
| proprietaire@gmail.com | Test@123456 | Owner Client | Agence Mali |
| locataire@gmail.com | Test@123456 | Renter Client | Bamako Immo |

---

## 🎯 **Testing Checklist**

- ✅ Basic authentication (login/logout)
- ✅ Email verification requirement
- ✅ Password reset flow
- ✅ Google OAuth (if configured)
- ✅ Tenant isolation (cross-tenant access blocked)
- ✅ RBAC (admin vs agent permissions)
- ✅ Client registration
- ✅ Team management (invite, update, remove)
- ✅ Collaborator invitations

---

**Enjoy testing!** 🚀

