import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import React from 'react';

import { ADMIN_SESSION_COOKIE, hashAdminSecret, verifyAdminSecret } from '@/lib/auth/admin';

export const runtime = 'nodejs';

async function loginAction(formData: FormData): Promise<void> {
  'use server';

  const secretInput = formData.get('secret');
  const redirectTarget = formData.get('redirect');

  const nextPath =
    typeof redirectTarget === 'string' && redirectTarget.startsWith('/admin')
      ? redirectTarget
      : '/admin';
  const redirectValue =
    typeof redirectTarget === 'string' && redirectTarget.startsWith('/admin')
      ? redirectTarget
      : '/admin';

  if (typeof secretInput !== 'string' || !secretInput.trim()) {
    redirect(`/admin/login?redirect=${encodeURIComponent(redirectValue)}&error=${encodeURIComponent('Укажите секретный ключ администратора')}`);
  }

  // Тайминг-безопасная проверка секрета
  const isValid = await verifyAdminSecret(secretInput.trim());
  if (!isValid) {
    redirect(`/admin/login?redirect=${encodeURIComponent(redirectValue)}&error=${encodeURIComponent('Неверный секретный ключ')}`);
  }

  const hashed = await hashAdminSecret(secretInput.trim());
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, hashed, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  });

  redirect(nextPath as any);
}

type SearchParamsPromise = Promise<Record<string, string | string[] | undefined>>;

async function AdminLoginPage({
  searchParams
}: {
  searchParams: SearchParamsPromise;
}): Promise<React.JSX.Element> {
  const resolvedParams = await searchParams;
  const redirectParam = resolvedParams.redirect;
  const errorParam = resolvedParams.error;
  const redirectValue =
    typeof redirectParam === 'string' && redirectParam.startsWith('/admin')
      ? redirectParam
      : '/admin';
  const errorText = typeof errorParam === 'string' ? errorParam : null;

  return (
    <div className="admin-shell flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-lg space-y-8 rounded-[28px] border border-white/10 bg-[#0d1220]/90 p-10 shadow-[0_30px_70px_rgba(6,8,15,0.6)] backdrop-blur-2xl">
        <header className="space-y-3 text-center">
          <p className="text-[10px] uppercase tracking-[0.36em] text-gold-300/70">Astrobot Admin</p>
          <h1 className="text-3xl font-semibold text-white">Доступ в консоль</h1>
          <p className="text-sm text-platinum/60">
            Введите секретный ключ администратора для продолжения работы.
          </p>
        </header>

        {errorText ? (
          <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {errorText}
          </div>
        ) : null}

        <form action={loginAction} className="space-y-5">
          <input type="hidden" name="redirect" value={redirectValue} />
          <label className="flex flex-col gap-2 text-sm text-platinum/70">
            Секретный ключ
            <input
              autoComplete="off"
              className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base text-white outline-none transition focus:border-gold-300 focus:bg-black/60"
              name="secret"
              placeholder="••••••••"
              type="password"
              required
            />
          </label>
          <button
            className="w-full rounded-2xl bg-gradient-to-r from-[#f3c96a] to-[#d8a348] px-6 py-3 text-sm font-semibold uppercase tracking-[0.22em] text-[#1a1204] shadow-[0_18px_36px_rgba(211,162,64,0.35)] transition active:scale-[0.97]"
            type="submit"
          >
            Войти
          </button>
        </form>
      </section>
    </div>
  );
}

export default AdminLoginPage;
