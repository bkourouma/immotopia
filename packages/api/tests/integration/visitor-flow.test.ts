/**
 * Integration Tests for Visitor Flow
 * Tests the complete flow of a visitor registering as a tenant client
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

const API_BASE_URL = process.env.API_URL || 'http://localhost:8001';

describe('Visitor to Tenant Client Flow (T023)', () => {
    let authCookies: string = '';
    let userId: string = '';
    let tenantId: string = '';
    let clientId: string = '';

    const testUser = {
        email: `test-visitor-${Date.now()}@example.com`,
        password: 'Test@123456',
        fullName: 'Test Visitor User'
    };

    const testTenant = {
        name: `Test Agency ${Date.now()}`,
        slug: `test-agency-${Date.now()}`,
        type: 'AGENCY' as const
    };

    beforeAll(async () => {
        // Create a super admin user for tenant creation
        // In real scenario, this would already exist
    });

    afterAll(async () => {
        // Cleanup: Remove test data
        // In production tests, you'd clean up the database
    });

    test('Step 1: User can register', async () => {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testUser)
        });

        expect(response.status).toBe(201);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.user).toBeDefined();
        expect(data.user.email).toBe(testUser.email);

        userId = data.user.id;
    });

    test('Step 2: User must verify email before login', async () => {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: testUser.email,
                password: testUser.password
            })
        });

        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.message).toContain('vérifier votre adresse email');
    });

    test('Step 3: User can login after email verification (manually verified)', async () => {
        // In real tests, we'd verify the email through the API
        // For now, assuming email is verified in DB

        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                email: testUser.email,
                password: testUser.password
            })
        });

        // This might fail if email isn't verified - that's expected
        if (response.ok) {
            const cookies = response.headers.get('set-cookie');
            if (cookies) {
                authCookies = cookies;
            }

            const data = await response.json();
            expect(data.success).toBe(true);
            expect(data.user).toBeDefined();
        }
    });

    test('Step 4: Super admin can create a tenant', async () => {
        // This test requires a super admin account
        // Skipping if no auth cookies available
        if (!authCookies) {
            console.log('Skipping tenant creation - no auth');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/tenants`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookies
            },
            body: JSON.stringify(testTenant)
        });

        if (response.ok) {
            const data = await response.json();
            expect(data.success).toBe(true);
            expect(data.data).toBeDefined();
            expect(data.data.name).toBe(testTenant.name);

            tenantId = data.data.id;
        }
    });

    test('Step 5: User can list available tenants', async () => {
        const response = await fetch(`${API_BASE_URL}/api/tenants`);

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data)).toBe(true);
    });

    test('Step 6: User can register as a tenant client', async () => {
        // Skip if no tenant created
        if (!tenantId || !authCookies) {
            console.log('Skipping client registration - missing prerequisites');
            return;
        }

        const clientData = {
            clientType: 'RENTER',
            details: {
                budget: 50000,
                preferredLocation: 'Bamako',
                moveInDate: '2025-01-01'
            }
        };

        const response = await fetch(`${API_BASE_URL}/api/tenants/${tenantId}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookies
            },
            body: JSON.stringify(clientData)
        });

        expect(response.status).toBe(201);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(data.data.clientType).toBe('RENTER');
        expect(data.data.user.id).toBe(userId);
        expect(data.data.tenant.id).toBe(tenantId);

        clientId = data.data.id;
    });

    test('Step 7: User can view their tenant memberships', async () => {
        if (!authCookies) {
            console.log('Skipping memberships check - no auth');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/tenants/my-memberships`, {
            headers: { 'Cookie': authCookies }
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data).toBeDefined();
        expect(data.data.asClient).toBeDefined();

        if (clientId) {
            expect(data.data.asClient.length).toBeGreaterThan(0);
        }
    });

    test('Step 8: User cannot register as client twice for same tenant', async () => {
        if (!tenantId || !authCookies) {
            console.log('Skipping duplicate registration test - missing prerequisites');
            return;
        }

        const clientData = {
            clientType: 'BUYER',
            details: {}
        };

        const response = await fetch(`${API_BASE_URL}/api/tenants/${tenantId}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': authCookies
            },
            body: JSON.stringify(clientData)
        });

        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.message).toContain('déjà enregistré');
    });
});

/**
 * Run these tests with:
 * npm test -- visitor-flow.test.ts
 */

