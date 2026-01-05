// Jest setup file for backend tests
// This file runs before all tests

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-for-testing-only';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';

// Global test timeout
jest.setTimeout(10000);

