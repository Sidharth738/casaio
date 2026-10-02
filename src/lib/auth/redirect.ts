const FALLBACK_REDIRECT = '/';

export function getSafeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return FALLBACK_REDIRECT;
  }

  try {
    const target = new URL(value, 'https://casaio.invalid');
    if (target.origin !== 'https://casaio.invalid') return FALLBACK_REDIRECT;
    if (target.pathname === '/login' || target.pathname === '/register') return FALLBACK_REDIRECT;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return FALLBACK_REDIRECT;
  }
}

export function getRoleHome(role: string): string {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'seller') return '/seller/dashboard';
  return '/';
}
