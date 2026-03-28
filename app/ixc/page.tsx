'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface AdminStats {
  totalUsers: number;
  totalStars: number;
  adminBoostActive: boolean;
  lastDrain?: {
    totalStars: number;
    affectedUsers: number;
    createdAt: string;
  };
}

interface StarsRevenue {
  totalStars: number;
  totalTransactions: number;
  today: {
    stars: number;
    transactions: number;
  };
  week: {
    stars: number;
    transactions: number;
  };
  month: {
    stars: number;
    transactions: number;
  };
  recentTransactions: Array<{
    id: string;
    userId: string;
    user: {
      telegramId: number;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
    };
    stars: number;
    createdAt: string;
    meta: unknown;
  }>;
}

const AdminControlPanel: React.FC = () => {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [totpToken, setTotpToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [requiresTOTP, setRequiresTOTP] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [boostEnabled, setBoostEnabled] = useState(false);
  const [boostTargetUsername, setBoostTargetUsername] = useState('');
  const [boostTargetUser, setBoostTargetUser] = useState<{ id: string; username: string | null; firstName: string | null; lastName: string | null } | null>(null);
  const [boostLoading, setBoostLoading] = useState(false);
  const [drainLoading, setDrainLoading] = useState(false);
  const [drainSuccess, setDrainSuccess] = useState(false);
  const [drainTargetUsername, setDrainTargetUsername] = useState('');
  const [drainAmount, setDrainAmount] = useState('');
  const [drainTargetUser, setDrainTargetUser] = useState<{ id: string; username: string | null; firstName: string | null; lastName: string | null } | null>(null);
  const [adminTelegramId, setAdminTelegramId] = useState<string>('');
  const [totpSetupMode, setTotpSetupMode] = useState(false);
  const [totpQrCode, setTotpQrCode] = useState<string>('');
  const [totpBackupCodes, setTotpBackupCodes] = useState<string[]>([]);
  const [totpVerificationToken, setTotpVerificationToken] = useState('');
  const [starsRevenue, setStarsRevenue] = useState<StarsRevenue | null>(null);
  const [showRevenue, setShowRevenue] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('admin_auth');
    const token = sessionStorage.getItem('admin_token');
    if (stored === 'true' && token) {
      setIsAuthenticated(true);
      fetchStats();
    }
  }, []);

  const showNotification = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setPasswordError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password,
          totpToken: totpToken || undefined
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requiresTOTP || data.totpConfigured) {
          // Если требуется TOTP - показываем поле для ввода кода
          setRequiresTOTP(true);
          setPasswordError('');
          // Пароль уже правильный, не очищаем его
        } else {
          setPasswordError(data.error || 'Неверный пароль');
          setPassword(''); // Очищаем пароль только при ошибке
        }
        return;
      }

      // Успешный вход - сохраняем токен и время истечения
      sessionStorage.setItem('admin_auth', 'true');
      sessionStorage.setItem('admin_token', data.token);
      if (data.expiresAt) {
        sessionStorage.setItem('admin_token_expires', data.expiresAt);
      }
      setIsAuthenticated(true);
      setPassword('');
      setTotpToken('');
      setRequiresTOTP(false);
      
      // Если TOTP настроен, но не активирован - показываем уведомление
      if (data.totpNotEnabled) {
        showNotification('info', 'TOTP настроен, но не активирован. Рекомендуется активировать для безопасности.');
      }
      
      // Загружаем статистику после небольшой задержки, чтобы токен точно сохранился
      setTimeout(async () => {
        await fetchStats();
      }, 100);
    } catch (error) {
      setPasswordError('Ошибка подключения');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTOTPSetup = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      if (!token) {
        showNotification('error', 'Сессия истекла');
        setIsAuthenticated(false);
        return;
      }
      
      const res = await fetch('/api/admin/totp/setup', {
        method: 'POST',
        headers: {
          'X-Admin-Token': token
        }
      });

      if (!res.ok) throw new Error('Failed to setup TOTP');

      const data = await res.json();
      setTotpQrCode(data.qrCodeUrl);
      setTotpBackupCodes(data.backupCodes);
      setTotpSetupMode(true);
    } catch (error) {
      showNotification('error', 'Ошибка настройки TOTP');
    }
  };

  const handleTOTPEnable = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      if (!token) {
        showNotification('error', 'Сессия истекла');
        setIsAuthenticated(false);
        return;
      }
      
      const res = await fetch('/api/admin/totp/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token
        },
        body: JSON.stringify({ token: totpVerificationToken })
      });

      if (!res.ok) {
        showNotification('error', 'Неверный код подтверждения');
        return;
      }

      showNotification('success', 'Google Authenticator активирован');
      setTotpSetupMode(false);
      setTotpVerificationToken('');
    } catch (error) {
      showNotification('error', 'Ошибка активации TOTP');
    }
  };

  const fetchStarsRevenue = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      if (!token) return;
      
      const res = await fetch('/api/admin/stars-revenue', {
        headers: {
          'X-Admin-Token': token
        }
      });

      if (res.ok) {
        const data = await res.json();
        setStarsRevenue(data);
      }
    } catch (error) {
      console.error('Failed to fetch stars revenue:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await fetch('/api/admin/stats', {
        headers: {
          'X-Admin-Token': token || ''
        }
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Stats API error:', errorData);
        
        // Не сбрасываем аутентификацию при первой загрузке, если токен есть
        // Только если это явная ошибка авторизации
        if (res.status === 401 && token) {
          setIsAuthenticated(false);
          sessionStorage.clear();
          showNotification('error', 'Сессия истекла. Войдите заново.');
        } else {
          // Для других ошибок просто показываем уведомление, но не сбрасываем аутентификацию
          showNotification('error', 'Не удалось загрузить статистику');
        }
        return;
      }

      const data = await res.json();
      setStats(data);
      setBoostEnabled(data.adminBoostActive);
      setAdminTelegramId(data.adminTelegramId);
      
      // Загружаем статистику по звездам
      await fetchStarsRevenue();
    } catch (error) {
      console.error('Fetch stats error:', error);
      // Не сбрасываем аутентификацию при ошибке сети
      showNotification('error', 'Ошибка загрузки статистики. Попробуйте обновить страницу.');
    }
  };

  const handleSearchBoostUser = async () => {
    if (!boostTargetUsername.trim()) {
      setBoostTargetUser(null);
      return;
    }

    // Простой поиск через API boost (проверка существования пользователя)
    // Если пользователь не найден, API вернет ошибку
    setBoostTargetUser({ 
      id: 'temp', 
      username: boostTargetUsername.trim().replace(/^@/, ''), 
      firstName: null, 
      lastName: null 
    });
  };

  const handleToggleBoost = async () => {
    if (!boostTargetUsername.trim()) {
      showNotification('error', 'Укажите имя пользователя');
      return;
    }

    if (!boostTargetUser) {
      showNotification('error', 'Пользователь не найден в базе данных');
      return;
    }

    setBoostLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      const res = await fetch('/api/admin/boost', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token || ''
        },
        body: JSON.stringify({ 
          enabled: !boostEnabled,
          targetUsername: boostTargetUsername.trim()
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed');
      }

      const data = await res.json();
      setBoostEnabled(data.adminBoostEnabled);
      showNotification(
        'success',
        data.message || `Админ-буст ${data.adminBoostEnabled ? 'активирован' : 'отключён'}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка при изменении буста';
      showNotification('error', message);
    } finally {
      setBoostLoading(false);
    }
  };

  const handleSearchDrainUser = async () => {
    if (!drainTargetUsername.trim()) {
      setDrainTargetUser(null);
      return;
    }

    // Простой поиск через API drain (проверка существования пользователя)
    // Если пользователь не найден, API вернет ошибку
    setDrainTargetUser({ 
      id: 'temp', 
      username: drainTargetUsername.trim().replace(/^@/, ''), 
      firstName: null, 
      lastName: null 
    });
  };

  const handleDrainEconomy = async () => {
    if (!drainTargetUsername.trim()) {
      showNotification('error', 'Укажите имя пользователя');
      return;
    }

    if (!drainTargetUser) {
      showNotification('error', 'Пользователь не найден в базе данных');
      return;
    }

    const amount = parseInt(drainAmount);
    if (!amount || amount <= 0) {
      showNotification('error', 'Укажите сумму больше 0');
      return;
    }

    if (!window.confirm(`⚠️ ВНИМАНИЕ! Это переведёт ${amount} звёзд пользователю ${drainTargetUsername}!\n\nВы уверены?`)) {
      return;
    }

    setDrainLoading(true);
    try {
      const token = sessionStorage.getItem('admin_token');
      if (!token) {
        showNotification('error', 'Сессия истекла');
        setIsAuthenticated(false);
        return;
      }
      
      const res = await fetch('/api/admin/drain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token
        },
        body: JSON.stringify({
          targetUsername: drainTargetUsername.trim(),
          amount: amount
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed');
      }

      const data = await res.json();
      setDrainSuccess(true);
      showNotification(
        'success',
        data.message || `Переведено ${data.totalStars} звёзд пользователю ${drainTargetUsername}`
      );

      setTimeout(() => {
        setDrainSuccess(false);
        setDrainTargetUsername('');
        setDrainAmount('');
        setDrainTargetUser(null);
        fetchStats();
      }, 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка при сборе средств';
      showNotification('error', message);
    } finally {
      setDrainLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.clear();
    setIsAuthenticated(false);
    setPassword('');
    setStats(null);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0033 50%, #0a0a2e 100%)',
        backgroundAttachment: 'fixed'
      }}>
        <div className="w-full max-w-sm">
          {/* Header Neon */}
          <div className="text-center mb-8 px-4">
            <h1 className="text-4xl font-black mb-2" style={{
              color: '#00ff88',
              textShadow: '0 0 20px rgba(0, 255, 136, 0.8), 0 0 40px rgba(0, 255, 136, 0.4)',
              letterSpacing: '3px'
            }}>
              ◆ IXC ◆
            </h1>
            <p style={{ color: '#ff00ff', textShadow: '0 0 10px rgba(255, 0, 255, 0.6)' }}>
              ADMIN CONTROL PANEL
            </p>
          </div>

          {/* Login Form */}
          <form onSubmit={handlePasswordSubmit} className="space-y-4 px-4">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError('');
                }}
                placeholder="Пароль доступа"
                className="w-full px-4 py-3 bg-black border-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-all"
                style={{
                  borderColor: passwordError ? '#ff0055' : '#00ffff',
                  boxShadow: passwordError
                    ? '0 0 15px rgba(255, 0, 85, 0.5)'
                    : '0 0 15px rgba(0, 255, 255, 0.3)',
                  color: '#00ff88'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-cyan-400 hover:text-cyan-300"
              >
                {showPassword ? '👁️' : '🔒'}
              </button>
            </div>

            {requiresTOTP && (
              <div className="space-y-2">
                <div className="p-3 border-2 rounded" style={{
                  borderColor: '#00ff88',
                  background: 'rgba(0, 255, 136, 0.1)',
                  boxShadow: '0 0 15px rgba(0, 255, 136, 0.3)'
                }}>
                  <p className="text-xs mb-2 text-center font-bold" style={{ color: '#00ff88' }}>
                    🔐 Требуется код из Google Authenticator
                  </p>
                  <input
                    type="text"
                    value={totpToken}
                    onChange={(e) => {
                      setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6));
                      setPasswordError('');
                    }}
                    placeholder="000000"
                    className="w-full px-4 py-3 bg-black border-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-all"
                    style={{
                      borderColor: '#00ffff',
                      boxShadow: '0 0 15px rgba(0, 255, 255, 0.3)',
                      color: '#00ff88',
                      textAlign: 'center',
                      fontSize: '20px',
                      letterSpacing: '6px',
                      fontWeight: 'bold'
                    }}
                    maxLength={6}
                    inputMode="numeric"
                    autoFocus
                  />
                  <p className="text-xs text-cyan-400 mt-2 text-center">
                    Откройте приложение Google Authenticator и введите 6-значный код
                  </p>
                </div>
              </div>
            )}

            {passwordError && (
              <p className="text-red-500 text-sm animate-pulse">{passwordError}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || !password || (requiresTOTP && totpToken.length !== 6)}
              className="w-full py-3 font-bold uppercase tracking-widest transition-all duration-300"
              style={{
                background: isLoading
                  ? 'rgba(0, 255, 136, 0.2)'
                  : 'linear-gradient(90deg, #00ff88, #00ccff)',
                color: '#000',
                boxShadow: isLoading
                  ? '0 0 10px rgba(0, 255, 136, 0.3)'
                  : '0 0 30px rgba(0, 255, 136, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.2)',
                opacity: isLoading || !password || (requiresTOTP && totpToken.length !== 6) ? 0.5 : 1,
                cursor: isLoading || !password || (requiresTOTP && totpToken.length !== 6) ? 'not-allowed' : 'pointer'
              }}
            >
              {isLoading 
                ? '⏳ Проверка...' 
                : requiresTOTP 
                  ? '🔐 ВОЙТИ С КОДОМ' 
                  : '⚡ ВХОД'
              }
            </button>
          </form>

          {/* Footer */}
          <div className="text-center mt-8 px-4 text-xs" style={{ color: '#666' }}>
            <p>🔐 Данные защищены</p>
          </div>
        </div>
      </div>
    );
  }

  // Admin Panel View
  return (
    <div className="min-h-screen p-4 pb-20" style={{
      background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0033 50%, #0a0a2e 100%)',
      backgroundAttachment: 'fixed'
    }}>
      {/* Notification */}
      {notification && (
        <div className="fixed top-4 left-4 right-4 z-50 p-4 rounded animate-bounce" style={{
          background: notification.type === 'success'
            ? 'rgba(0, 255, 136, 0.9)'
            : notification.type === 'error'
            ? 'rgba(255, 0, 85, 0.9)'
            : 'rgba(0, 255, 255, 0.9)',
          color: '#000',
          boxShadow: `0 0 20px ${
            notification.type === 'success'
              ? 'rgba(0, 255, 136, 0.8)'
              : notification.type === 'error'
              ? 'rgba(255, 0, 85, 0.8)'
              : 'rgba(0, 255, 255, 0.8)'
          }`
        }}>
          <p className="font-bold">{notification.message}</p>
        </div>
      )}

      <div className="max-w-md mx-auto space-y-6">
        {/* Header */}
        <div className="text-center py-6">
          <h1 className="text-3xl font-black mb-2" style={{
            color: '#00ff88',
            textShadow: '0 0 20px rgba(0, 255, 136, 0.8)',
            letterSpacing: '2px'
          }}>
            ◆ ADMIN ◆
          </h1>
          <p style={{ color: '#ff00ff', textShadow: '0 0 10px rgba(255, 0, 255, 0.6)' }}>
            ID: {adminTelegramId}
          </p>
        </div>

        {/* Stats Card */}
        {stats && (
          <div className="border-2 p-6 space-y-4" style={{
            borderColor: '#00ffff',
            background: 'rgba(0, 255, 255, 0.05)',
            boxShadow: '0 0 20px rgba(0, 255, 255, 0.2), inset 0 0 20px rgba(0, 255, 255, 0.05)'
          }}>
            <div className="flex justify-between items-center">
              <span style={{ color: '#00ff88' }}>👥 Игроков:</span>
              <span className="font-bold text-lg" style={{
                color: '#00ffff',
                textShadow: '0 0 10px rgba(0, 255, 255, 0.8)'
              }}>
                {stats.totalUsers}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: '#00ff88' }}>⭐ Всего звёзд:</span>
              <span className="font-bold text-lg" style={{
                color: '#ffff00',
                textShadow: '0 0 10px rgba(255, 255, 0, 0.8)'
              }}>
                {stats.totalStars}
              </span>
            </div>
          </div>
        )}

        {/* Boost Control */}
        <div className="border-2 p-6" style={{
          borderColor: boostEnabled ? '#ff00ff' : '#666',
          background: boostEnabled
            ? 'rgba(255, 0, 255, 0.1)'
            : 'rgba(100, 100, 100, 0.1)',
          boxShadow: boostEnabled
            ? '0 0 20px rgba(255, 0, 255, 0.3)'
            : '0 0 10px rgba(100, 100, 100, 0.2)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg" style={{
              color: boostEnabled ? '#ff00ff' : '#999',
              textShadow: boostEnabled ? '0 0 10px rgba(255, 0, 255, 0.8)' : 'none'
            }}>
              ⚡ 90% WIN BOOST
            </h3>
            <span className="text-2xl">
              {boostEnabled ? '🟢' : '⚫'}
            </span>
          </div>

          <div className="space-y-3 mb-4">
            <input
              type="text"
              value={boostTargetUsername}
              onChange={(e) => {
                setBoostTargetUsername(e.target.value);
                setBoostTargetUser(null);
              }}
              onBlur={handleSearchBoostUser}
              placeholder="Имя пользователя (@username)"
              className="w-full px-4 py-2 bg-black border-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-all"
              style={{
                borderColor: boostTargetUser ? '#00ff88' : '#666',
                boxShadow: boostTargetUser ? '0 0 10px rgba(0, 255, 136, 0.3)' : 'none'
              }}
            />
            {boostTargetUser && (
              <div className="p-2 border border-green-500 bg-green-500/10 text-xs" style={{ color: '#00ff88' }}>
                ✅ Найден: {boostTargetUser.username ? `@${boostTargetUser.username}` : `${boostTargetUser.firstName || ''} ${boostTargetUser.lastName || ''}`.trim() || 'Без имени'}
              </div>
            )}
            {boostTargetUsername && !boostTargetUser && (
              <div className="p-2 border border-red-500 bg-red-500/10 text-xs" style={{ color: '#ff0055' }}>
                ❌ Пользователь не найден
              </div>
            )}
          </div>

          <button
            onClick={handleToggleBoost}
            disabled={boostLoading || !boostTargetUser}
            className="w-full py-3 font-bold uppercase tracking-widest transition-all duration-300"
            style={{
              background: boostEnabled && boostTargetUser
                ? 'linear-gradient(90deg, #ff00ff, #ff0055)'
                : boostTargetUser
                ? 'linear-gradient(90deg, #333, #555)'
                : 'rgba(100, 100, 100, 0.3)',
              color: '#000',
              boxShadow: boostEnabled && boostTargetUser
                ? '0 0 20px rgba(255, 0, 255, 0.8)'
                : 'none',
              cursor: boostTargetUser && !boostLoading ? 'pointer' : 'not-allowed',
              opacity: boostTargetUser && !boostLoading ? 1 : 0.5
            }}
          >
            {boostLoading ? '⏳ ОБРАБОТКА...' : boostEnabled ? '◆ ОТКЛЮЧИТЬ' : '◆ ВКЛЮЧИТЬ'}
          </button>
        </div>

        {/* Drain Control */}
        <div className="border-2 p-6" style={{
          borderColor: drainSuccess ? '#00ff88' : '#ff0055',
          background: drainSuccess
            ? 'rgba(0, 255, 136, 0.1)'
            : 'rgba(255, 0, 85, 0.1)',
          boxShadow: drainSuccess
            ? '0 0 20px rgba(0, 255, 136, 0.3)'
            : '0 0 20px rgba(255, 0, 85, 0.3)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg" style={{
              color: '#ff0055',
              textShadow: '0 0 10px rgba(255, 0, 85, 0.8)'
            }}>
              💰 СБОР СРЕДСТВ
            </h3>
            <span className="text-2xl animate-pulse">⚠️</span>
          </div>

          <div className="space-y-3 mb-4">
            <input
              type="text"
              value={drainTargetUsername}
              onChange={(e) => {
                setDrainTargetUsername(e.target.value);
                setDrainTargetUser(null);
              }}
              onBlur={handleSearchDrainUser}
              placeholder="Имя пользователя (@username)"
              className="w-full px-4 py-2 bg-black border-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-all"
              style={{
                borderColor: drainTargetUser ? '#00ff88' : '#666',
                boxShadow: drainTargetUser ? '0 0 10px rgba(0, 255, 136, 0.3)' : 'none'
              }}
            />
            {drainTargetUser && (
              <div className="p-2 border border-green-500 bg-green-500/10 text-xs" style={{ color: '#00ff88' }}>
                ✅ Найден: {drainTargetUser.username ? `@${drainTargetUser.username}` : `${drainTargetUser.firstName || ''} ${drainTargetUser.lastName || ''}`.trim() || 'Без имени'}
              </div>
            )}
            {drainTargetUsername && !drainTargetUser && (
              <div className="p-2 border border-red-500 bg-red-500/10 text-xs" style={{ color: '#ff0055' }}>
                ❌ Пользователь не найден
              </div>
            )}
            <input
              type="number"
              value={drainAmount}
              onChange={(e) => setDrainAmount(e.target.value)}
              placeholder="Сумма (звёзды)"
              min="1"
              className="w-full px-4 py-2 bg-black border-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-all"
              style={{
                borderColor: '#666',
                boxShadow: 'none'
              }}
            />
          </div>

          {stats?.lastDrain && (
            <div className="mb-4 p-3 border border-gray-600 text-xs" style={{ color: '#999' }}>
              <p>Последняя операция:</p>
              <p>💫 {stats.lastDrain.totalStars} звёзд от {stats.lastDrain.affectedUsers} игроков</p>
            </div>
          )}

          <button
            onClick={handleDrainEconomy}
            disabled={drainLoading || !drainTargetUser || !drainAmount}
            className="w-full py-3 font-bold uppercase tracking-widest transition-all duration-300"
            style={{
              background: drainLoading || !drainTargetUser || !drainAmount
                ? 'rgba(255, 0, 85, 0.3)'
                : 'linear-gradient(90deg, #ff0055, #ff6600)',
              color: '#000',
              boxShadow: !drainLoading && drainTargetUser && drainAmount
                ? '0 0 30px rgba(255, 0, 85, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.1)'
                : 'none',
              opacity: drainLoading || !drainTargetUser || !drainAmount ? 0.5 : 1,
              cursor: drainLoading || !drainTargetUser || !drainAmount ? 'not-allowed' : 'pointer'
            }}
          >
            {drainLoading ? '⏳ ПЕРЕВОД...' : '🔴 ПЕРЕВЕСТИ'}
          </button>
        </div>

        {/* Google Authenticator Setup Section - ВЫДЕЛЕННЫЙ РАЗДЕЛ */}
        <div className="border-2 p-6" style={{
          borderColor: '#00ff88',
          background: 'rgba(0, 255, 136, 0.1)',
          boxShadow: '0 0 30px rgba(0, 255, 136, 0.4)',
          animation: 'pulse 2s infinite'
        }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-xl mb-1" style={{
                color: '#00ff88',
                textShadow: '0 0 15px rgba(0, 255, 136, 0.9)'
              }}>
                🔐 Google Authenticator
              </h3>
              <p className="text-xs" style={{ color: '#aaa' }}>
                Двухфакторная аутентификация для защиты панели
              </p>
            </div>
            <span className="text-3xl">🛡️</span>
          </div>
          
          {!totpSetupMode && (
            <div className="space-y-3">
              <button
                onClick={handleTOTPSetup}
                className="w-full py-4 font-bold uppercase tracking-widest transition-all duration-300"
                style={{
                  background: 'linear-gradient(90deg, #00ff88, #00ccff)',
                  color: '#000',
                  boxShadow: '0 0 25px rgba(0, 255, 136, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.3)',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                ⚙️ НАСТРОИТЬ GOOGLE AUTHENTICATOR
              </button>
              <p className="text-xs text-center" style={{ color: '#888' }}>
                Нажмите кнопку выше, чтобы настроить двухфакторную аутентификацию
              </p>
            </div>
          )}
        </div>

        {/* Stars Revenue Section */}
        <div className="border-2 p-6" style={{
          borderColor: '#ffff00',
          background: 'rgba(255, 255, 0, 0.05)',
          boxShadow: '0 0 20px rgba(255, 255, 0, 0.2)'
        }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg" style={{
              color: '#ffff00',
              textShadow: '0 0 10px rgba(255, 255, 0, 0.8)'
            }}>
              💰 Telegram Stars Доходы
            </h3>
            <button
              onClick={() => setShowRevenue(!showRevenue)}
              className="text-xs px-3 py-1 border border-yellow-400 text-yellow-400 hover:bg-yellow-400/20 transition"
            >
              {showRevenue ? 'Скрыть' : 'Показать'}
            </button>
          </div>
          
          {starsRevenue && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span style={{ color: '#aaa' }}>Всего куплено:</span>
                <span className="font-bold" style={{ color: '#ffff00' }}>
                  {starsRevenue.totalStars.toLocaleString('ru-RU')} ⭐
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#aaa' }}>Сегодня:</span>
                <span style={{ color: '#00ff88' }}>
                  {starsRevenue.today.stars.toLocaleString('ru-RU')} ⭐ ({starsRevenue.today.transactions})
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#aaa' }}>За неделю:</span>
                <span style={{ color: '#00ccff' }}>
                  {starsRevenue.week.stars.toLocaleString('ru-RU')} ⭐ ({starsRevenue.week.transactions})
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: '#aaa' }}>За месяц:</span>
                <span style={{ color: '#ff00ff' }}>
                  {starsRevenue.month.stars.toLocaleString('ru-RU')} ⭐ ({starsRevenue.month.transactions})
                </span>
              </div>
              
              {showRevenue && starsRevenue.recentTransactions.length > 0 && (
                <div className="mt-4 pt-4 border-t border-yellow-400/30">
                  <p className="text-xs mb-2" style={{ color: '#aaa' }}>Последние покупки:</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {starsRevenue.recentTransactions.slice(0, 10).map((t) => (
                      <div key={t.id} className="text-xs p-2 bg-black/50 border border-yellow-400/20">
                        <div className="flex justify-between">
                          <span style={{ color: '#aaa' }}>
                            {t.user.username ? `@${t.user.username}` : `${t.user.firstName || ''} ${t.user.lastName || ''}`.trim() || `ID:${t.user.telegramId}`}
                          </span>
                          <span style={{ color: '#ffff00' }}>{t.stars} ⭐</span>
                        </div>
                        <div className="text-xs mt-1" style={{ color: '#666' }}>
                          {new Date(t.createdAt).toLocaleString('ru-RU')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <div className="mt-4 pt-4 border-t border-yellow-400/30">
            <p className="text-xs mb-2" style={{ color: '#ffaa00' }}>
              📌 Как вывести звезды:
            </p>
            <div className="text-xs space-y-1" style={{ color: '#aaa' }}>
              <p>1. Telegram Stars автоматически зачисляются на счет бота</p>
              <p>2. Вывести можно через:</p>
              <p className="pl-4">• Telegram Bot API (getStarTransactions)</p>
              <p className="pl-4">• Панель разработчика @BotFather</p>
              <p className="pl-4">• Telegram Stars Dashboard</p>
              <p className="mt-2 text-yellow-400">
                💡 Все транзакции сохраняются в БД для отчетности
              </p>
            </div>
          </div>
        </div>


        {/* TOTP Setup Modal */}
        {totpSetupMode && (
          <div className="border-2 p-6" style={{
            borderColor: '#00ff88',
            background: 'rgba(0, 255, 136, 0.1)',
            boxShadow: '0 0 30px rgba(0, 255, 136, 0.5)'
          }}>
            <h3 className="font-bold text-lg mb-4" style={{
              color: '#00ff88',
              textShadow: '0 0 10px rgba(0, 255, 136, 0.8)'
            }}>
              📱 Настройка Google Authenticator
            </h3>
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-xs mb-2" style={{ color: '#aaa' }}>
                  1. Отсканируйте QR-код в приложении Google Authenticator
                </p>
                {totpQrCode && (
                  <img 
                    src={totpQrCode} 
                    alt="TOTP QR Code" 
                    className="mx-auto border-2 border-cyan-400"
                    style={{ maxWidth: '200px' }}
                  />
                )}
              </div>
              <div>
                <p className="text-xs mb-2" style={{ color: '#aaa' }}>
                  2. Введите код подтверждения из приложения:
                </p>
                <input
                  type="text"
                  value={totpVerificationToken}
                  onChange={(e) => {
                    setTotpVerificationToken(e.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="000000"
                  className="w-full px-4 py-3 bg-black border-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-all"
                  style={{
                    borderColor: '#00ffff',
                    boxShadow: '0 0 15px rgba(0, 255, 255, 0.3)',
                    color: '#00ff88',
                    textAlign: 'center',
                    fontSize: '18px',
                    letterSpacing: '4px'
                  }}
                  maxLength={6}
                  inputMode="numeric"
                />
              </div>
              {totpBackupCodes.length > 0 && (
                <div>
                  <p className="text-xs mb-2" style={{ color: '#ffaa00' }}>
                    ⚠️ Сохраните резервные коды (используйте один раз):
                  </p>
                  <div className="bg-black p-3 border border-yellow-400/50">
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono" style={{ color: '#ffaa00' }}>
                      {totpBackupCodes.map((code, idx) => (
                        <div key={idx}>{code}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTotpSetupMode(false);
                    setTotpVerificationToken('');
                    setTotpQrCode('');
                    setTotpBackupCodes([]);
                  }}
                  className="flex-1 py-2 font-bold uppercase text-sm border-2"
                  style={{
                    borderColor: '#999',
                    color: '#999',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  Отмена
                </button>
                <button
                  onClick={handleTOTPEnable}
                  disabled={totpVerificationToken.length !== 6}
                  className="flex-1 py-2 font-bold uppercase text-sm transition-all duration-300"
                  style={{
                    background: totpVerificationToken.length === 6
                      ? 'linear-gradient(90deg, #00ff88, #00ccff)'
                      : 'rgba(0, 255, 136, 0.2)',
                    color: '#000',
                    opacity: totpVerificationToken.length === 6 ? 1 : 0.5,
                    cursor: totpVerificationToken.length === 6 ? 'pointer' : 'not-allowed'
                  }}
                >
                  Активировать
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full py-3 font-bold uppercase tracking-widest transition-all border-2"
          style={{
            borderColor: '#999',
            color: '#999',
            background: 'transparent',
            cursor: 'pointer'
          }}
        >
          🚪 ВЫХОД
        </button>

        {/* Footer */}
        <div className="text-center text-xs space-y-1" style={{ color: '#666' }}>
          <p>🔐 Секретная админ-панель</p>
          <p>Все действия логируются</p>
        </div>
      </div>
    </div>
  );
};

export default AdminControlPanel;




