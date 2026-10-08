import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { createLoginChallenge, hashLoginCode, readLoginChallenge } from '../../packages/server/src/auth/login-verification';

describe('login email challenge tokens', () => {
  it('signs a single-use challenge and binds the OTP hash to its nonce', () => {
    const userId = new Types.ObjectId().toString();
    const challenge = createLoginChallenge(userId);
    const claims = readLoginChallenge(challenge.loginToken);

    expect(claims).toEqual({ userId, nonce: challenge.nonce });
    expect(hashLoginCode(challenge.nonce, '123456')).not.toBe(hashLoginCode(challenge.nonce, '654321'));
    expect(hashLoginCode(challenge.nonce, '123456')).not.toBe(hashLoginCode('different-nonce', '123456'));
  });

  it('rejects noncanonical and modified signatures', () => {
    const challenge = createLoginChallenge(new Types.ObjectId().toString());
    expect(readLoginChallenge(`${challenge.loginToken}x`)).toBeNull();
    const parts = challenge.loginToken.split('.');
    const payload = parts[0] ?? '';
    const signature = parts[1] ?? '';
    const changedLastCharacter = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    expect(readLoginChallenge(`${payload}.${changedLastCharacter}`)).toBeNull();
  });
});
