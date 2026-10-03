// Synthetic three-project portfolio used by the demo page and tests.
export const sampleProjects = [
  { key: 'APP', name: 'Mobile App' },
  { key: 'PAY', name: 'Payments' },
  { key: 'WEB', name: 'Website' },
];

// Points completed per person per project over the last 12 weeks.
const done = {
  'Aisha Khan': { PAY: 36, APP: 12 },
  'Ben Ortiz': { APP: 40 },
  'Chen Wei': { APP: 12, PAY: 12, WEB: 12 },
  'Eli Brooks': { APP: 24, PAY: 20 },
  'Farah Said': { WEB: 40 },
};
export const sampleCompleted = Object.entries(done).flatMap(([assignee, byProject]) =>
  Object.entries(byProject).flatMap(([project, points]) =>
    // split into 4-point tasks
    Array.from({ length: points / 4 }, () => ({ project, assignee, points: 4 })),
  ),
);

const t = (key, summary, assignee, points, due, status = 'To Do') => ({
  key, summary, project: key.split('-')[0], assignee, points, due, status,
});

// Open work in the next 6 weeks, in priority order.
export const sampleOpen = [
  t('PAY-101', 'Refund API: partial refunds', 'Aisha Khan', 8, '2026-10-14', 'In Progress'),
  t('PAY-104', 'PCI audit evidence pack', 'Aisha Khan', 5, '2026-10-20'),
  t('APP-210', 'Fix crash on Android 15 login', 'Aisha Khan', 3, '2026-10-21'),
  t('PAY-107', 'Webhook retries and dead-letter queue', 'Aisha Khan', 8, '2026-10-28'),
  t('APP-214', 'Push notification settings screen', 'Aisha Khan', 3, '2026-11-04'),
  t('PAY-112', 'Currency conversion for EUR payouts', 'Aisha Khan', 5, '2026-11-11'),
  t('PAY-115', 'Apple Pay integration', null, 13, '2026-10-30'),
  t('PAY-116', 'Fraud rules admin UI', null, 8, '2026-11-06'),
  t('PAY-118', 'Settlement report export', null, 5, '2026-11-12'),
  t('PAY-120', 'Load test checkout at 5x traffic', null, 4, null),
  t('PAY-109', 'Ledger reconciliation job', 'Chen Wei', 6, '2026-10-24', 'In Progress'),
  t('APP-201', 'Offline mode for order history', 'Ben Ortiz', 8, '2026-10-17', 'In Progress'),
  t('APP-205', 'Dark mode polish', 'Ben Ortiz', 5, '2026-10-29'),
  t('APP-208', 'App Store screenshots refresh', 'Ben Ortiz', 5, '2026-11-08'),
  t('APP-212', 'Accessibility audit fixes', 'Chen Wei', 5, '2026-10-31'),
  t('APP-216', 'In-app review prompt', 'Eli Brooks', 3, '2026-10-22'),
  t('APP-218', 'Deep links from email campaigns', 'Eli Brooks', 5, '2026-11-05'),
  t('APP-220', 'Tablet layout for checkout', null, 5, '2026-11-13'),
  t('WEB-301', 'Pricing page redesign', 'Farah Said', 8, '2026-10-19', 'In Progress'),
  t('WEB-303', 'Cookie consent update', 'Farah Said', 4, '2026-10-27'),
  t('WEB-305', 'Blog migration to new CMS', 'Chen Wei', 8, '2026-11-03'),
  t('WEB-307', 'Careers page', 'Dana Novak', 5, '2026-11-10'),
  t('WEB-309', 'Image CDN switch', null, 3, null),
];
