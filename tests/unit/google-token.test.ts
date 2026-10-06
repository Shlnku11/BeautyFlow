import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdTokenMock, clientConstructorMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  clientConstructorMock: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
  OAuth2Client: class MockOAuth2Client {
    constructor(clientId: string, clientSecret: string) { clientConstructorMock(clientId, clientSecret); }
    verifyIdToken(options: unknown) { return verifyIdTokenMock(options); }
  },
}));

describe('Google ID token verification', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'server-only-secret';
    verifyIdTokenMock.mockReset();
    clientConstructorMock.mockReset();
  });

  it('verifies the Google audience and accepts a verified identity', async () => {
    const { verifyGoogleIdToken } = await import('../../packages/server/src/auth/google-token');
    verifyIdTokenMock.mockResolvedValue({ getPayload: () => ({
      sub: 'google-subject', email: 'Owner@Example.test', email_verified: true, name: 'Owner', picture: 'https://lh3.googleusercontent.com/avatar',
    }) });
    await expect(verifyGoogleIdToken('signed-id-token')).resolves.toEqual({
      googleId: 'google-subject', email: 'owner@example.test', name: 'Owner', avatarUrl: 'https://lh3.googleusercontent.com/avatar',
    });
    expect(clientConstructorMock).toHaveBeenCalledWith('client-id.apps.googleusercontent.com', 'server-only-secret');
    expect(verifyIdTokenMock).toHaveBeenCalledWith({ idToken: 'signed-id-token', audience: 'client-id.apps.googleusercontent.com' });
  });

  it('rejects invalid signatures and unverified email claims', async () => {
    const { verifyGoogleIdToken } = await import('../../packages/server/src/auth/google-token');
    verifyIdTokenMock.mockRejectedValueOnce(new Error('bad signature'));
    await expect(verifyGoogleIdToken('bad-token')).rejects.toMatchObject({ httpStatus: 401, code: 'GOOGLE_TOKEN_INVALID' });
    verifyIdTokenMock.mockResolvedValueOnce({ getPayload: () => ({ sub: 'subject', email: 'user@example.test', email_verified: false }) });
    await expect(verifyGoogleIdToken('unverified-email-token')).rejects.toMatchObject({ httpStatus: 401, code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('leaves OAuth disabled without both credentials', async () => {
    process.env.GOOGLE_CLIENT_ID = '';
    process.env.GOOGLE_CLIENT_SECRET = '';
    const { isGoogleOAuthConfigured, verifyGoogleIdToken } = await import('../../packages/server/src/auth/google-token');
    expect(isGoogleOAuthConfigured()).toBe(false);
    await expect(verifyGoogleIdToken('unused-token')).rejects.toMatchObject({ httpStatus: 503, code: 'GOOGLE_AUTH_UNAVAILABLE' });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });
});
