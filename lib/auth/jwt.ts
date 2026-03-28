import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is not set');
  }
  return 'dev-insecure-jwt-secret';
}

export interface JWTPayload {
  userId: string;
  telegramId: number;
  iat: number;
  exp: number;
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JWTPayload;
    return decoded;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('JWT verification failed:', error);
    }
    return null;
  }
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const cookie = req.cookies.get('auth-token');
  return cookie?.value || null;
}

export function getUserFromRequest(req: NextRequest): JWTPayload | null {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const user = verifyToken(token);
  return user;
}

export function requireAuth(req: NextRequest): JWTPayload {
  const user = getUserFromRequest(req);
  if (!user) {
    throw new Error('Authentication required');
  }
  return user;
}
