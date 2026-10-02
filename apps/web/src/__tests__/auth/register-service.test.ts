import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiClient from '../../utils/api-client';
import { register } from '../../services/auth-service';

vi.mock('../../utils/api-client', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }
}));

const mockPost = (apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post;

describe('auth-service.register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { success: true } });
  });

  it('envoie confirmPassword, exigé par registerSchema côté API (sinon 422)', async () => {
    await register({ email: 'a@b.test', password: 'Secret123!', confirmPassword: 'Secret123!', fullName: 'A B' });
    expect(mockPost).toHaveBeenCalledWith('/auth/register', {
      email: 'a@b.test',
      password: 'Secret123!',
      confirmPassword: 'Secret123!',
      fullName: 'A B'
    });
  });
});
