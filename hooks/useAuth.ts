'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTelegram } from '../context/TelegramContext';
import { createApiClient } from '../lib/apiClient';

interface User {
  id: string;
  telegramId: number;
  displayName: string;
  balance: number;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export function useAuth() {
  const { initDataRaw, isReady } = useTelegram();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
  });

  const apiClient = createApiClient({
    baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
  });

  type TelegramAuthResponse = {
    user?: User;
    error?: string;
  };

  const authenticate = useCallback(async () => {
    if (!initDataRaw || !isReady) {
      console.log('[useAuth] Skipping auth - initDataRaw:', !!initDataRaw, 'isReady:', isReady);
      return;
    }

    console.log('[useAuth] Starting authentication...');
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await apiClient.post<
        { initData: string },
        TelegramAuthResponse
      >('/api/auth/telegram', {
        initData: initDataRaw,
      });

      console.log('[useAuth] Auth response:', response);

      if (response.user) {
        console.log('[useAuth] Authentication successful:', response.user);
        setAuthState({
          user: response.user,
          isLoading: false,
          isAuthenticated: true,
          error: null,
        });
      } else {
        console.log('[useAuth] No user in response');
        throw new Error(response.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('[useAuth] Authentication error:', error);
      setAuthState({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  }, [initDataRaw, isReady, apiClient]);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }

    setAuthState({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });
  }, [apiClient]);

  useEffect(() => {
    if (isReady && initDataRaw) {
      authenticate();
    } else if (isReady && !initDataRaw) {
      // For development or when Telegram WebApp is not available
      setAuthState(prev => ({ ...prev, isLoading: false }));
    }
  }, [isReady, initDataRaw, authenticate]);

  return {
    ...authState,
    authenticate,
    logout,
  };
}
