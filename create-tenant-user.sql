-- ============================================
-- SCRIPT DE CRÉATION D'UTILISATEUR ET TENANT CLIENT
-- Utilisateur avec nom africain
-- ============================================

-- 1. Créer l'utilisateur de test avec un nom africain
INSERT INTO users (
  id, 
  email, 
  password_hash, 
  full_name, 
  global_role, 
  email_verified, 
  is_active,
  created_at, 
  updated_at
)
VALUES (
  'test-tenant-user-id',
  'locataire@test.com',
  '$2b$10$IOZn5uOufydTQXrmDrQGg.OEcOsnrJbRpjUgr6F7zbTUeJkbXucdq', -- Hash bcrypt pour "password123"
  'Amadou Diallo', -- Nom africain (Sénégal)
  'USER',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  password_hash = EXCLUDED.password_hash,
  full_name = EXCLUDED.full_name,
  updated_at = NOW();

-- 2. Créer le TenantClient associé
-- Note: Remplacez 'YOUR-TENANT-ID' par l'ID d'un tenant existant dans votre base de données
-- Vous pouvez obtenir un tenant_id avec: SELECT id FROM tenants LIMIT 1;
INSERT INTO tenant_clients (
  id, 
  tenant_id, 
  user_id, 
  client_type, 
  created_at, 
  updated_at
)
VALUES (
  'test-tenant-client-id',
  (SELECT id FROM tenants WHERE is_active = true LIMIT 1), -- Utilise le premier tenant actif
  'test-tenant-user-id',
  'RENTER',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  user_id = EXCLUDED.user_id,
  client_type = EXCLUDED.client_type,
  updated_at = NOW();

-- Vérification
SELECT 
  u.id as user_id,
  u.email,
  u.full_name,
  u.global_role,
  u.email_verified,
  u.is_active,
  tc.id as tenant_client_id,
  tc.client_type,
  t.name as tenant_name
FROM users u
LEFT JOIN tenant_clients tc ON u.id = tc.user_id
LEFT JOIN tenants t ON tc.tenant_id = t.id
WHERE u.id = 'test-tenant-user-id';
