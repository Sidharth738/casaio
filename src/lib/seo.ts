export const SITE_NAME = 'Casaio';
export const SITE_DESCRIPTION =
  'Discover curated luxury furniture, architectural lighting, and artisanal home decor from verified workshops and suppliers.';

const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
export const SITE_URL = (configuredOrigin || 'https://casaio.in').replace(/\/$/, '');

export function absoluteUrl(path = '/') {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function cleanDescription(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1).trimEnd()}…` : normalized;
}

export function safeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: SITE_URL,
  logo: absoluteUrl('/casaio-logo.jpeg'),
  email: 'casaio.official@gmail.com',
  sameAs: ['https://www.instagram.com/casaio.official/'],
};

export const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: SITE_URL,
  publisher: { '@id': `${SITE_URL}/#organization` },
};
