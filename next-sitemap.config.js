/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://autokkeep.com',
  generateRobotsTxt: true,
  exclude: [
    '/dashboard*',
    '/settings*',
    '/analytics*',
    '/onboarding*',
    '/transactions*',
    '/chart-of-accounts*',
    '/account*',
    '/admin*',
    '/close*',
    '/health*',
    '/insights*',
    '/portfolio*',
    '/tax*',
    '/vendors*',
    '/reports*',
    '/audit*',
    '/notifications*',
    '/api/*',
    '/auth/callback',
    '/auth/reset-password',
  ],
  robotsTxtOptions: {
    policies: [
      { userAgent: '*', allow: '/' },
      { userAgent: '*', disallow: ['/dashboard', '/settings', '/analytics', '/onboarding', '/transactions', '/chart-of-accounts', '/account', '/admin', '/close', '/health', '/insights', '/portfolio', '/tax', '/vendors', '/reports', '/audit', '/notifications', '/api', '/auth/callback'] },
    ],
  },
};
