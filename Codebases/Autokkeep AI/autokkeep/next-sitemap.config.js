/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://autokkeep.com',
  generateRobotsTxt: true,
  exclude: [
    '/dashboard*',
    '/settings*',
    '/analytics*',
    '/onboarding*',
    '/transactions*',
    '/api/*',
    '/auth/callback',
    '/auth/reset-password',
  ],
  robotsTxtOptions: {
    policies: [
      { userAgent: '*', allow: '/' },
      { userAgent: '*', disallow: ['/dashboard', '/settings', '/analytics', '/onboarding', '/transactions', '/api', '/auth/callback'] },
    ],
  },
};
