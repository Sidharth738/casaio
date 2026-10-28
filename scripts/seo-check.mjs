import { existsSync, readFileSync } from 'node:fs';

const checks = [
  ['central SEO configuration', 'src/lib/seo.ts'],
  ['root metadata', 'src/app/layout.tsx'],
  ['robots route', 'src/app/robots.ts'],
  ['sitemap route', 'src/app/sitemap.ts'],
  ['product metadata', 'src/app/(shop)/products/[slug]/page.tsx'],
  ['category metadata', 'src/app/(shop)/categories/[slug]/page.tsx'],
];

const failures = [];
for (const [label, file] of checks) {
  if (!existsSync(file)) failures.push(`${label}: missing ${file}`);
}

const sitemapSource = readFileSync('src/app/sitemap.ts', 'utf8');
const robotsSource = readFileSync('src/app/robots.ts', 'utf8');
const layoutSource = readFileSync('src/app/layout.tsx', 'utf8');

if (sitemapSource.includes("'/login'") || sitemapSource.includes("'/register'")) {
  failures.push('sitemap: authentication routes must not be included');
}
if (sitemapSource.includes('.slice(0, 20)')) {
  failures.push('sitemap: product coverage is artificially limited to 20 URLs');
}
for (const route of ['/api/', '/admin', '/seller', '/account', '/checkout', '/cart']) {
  if (!robotsSource.includes(route)) failures.push(`robots: missing private route exclusion ${route}`);
}
if (!layoutSource.includes('metadataBase: new URL(SITE_URL)')) {
  failures.push('metadata: metadataBase is not connected to centralized SITE_URL');
}

const builtSitemap = '.next/server/app/sitemap.xml.body';
if (existsSync(builtSitemap)) {
  const sitemap = readFileSync(builtSitemap, 'utf8');
  for (const route of ['/login', '/register', '/admin', '/seller', '/account', '/checkout', '/cart']) {
    if (sitemap.includes(`>${route}`) || sitemap.includes(`>${route}/`)) {
      failures.push(`built sitemap: contains private route ${route}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`SEO check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log('SEO checks passed.');
