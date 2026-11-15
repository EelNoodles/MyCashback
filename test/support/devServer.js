'use strict';

/**
 * Seeded local server for UI work and the Playwright e2e suite:
 *   node test/support/devServer.js [port]
 * Uses the test database (wiped on start) and the header/cookie stub auth —
 * the e2e suite sets a `testuser=demo` cookie.
 */
const H = require('./harness');
const { seed } = require('./seed');

(async () => {
  if (!(await H.dbAvailable())) {
    console.error('database not available');
    process.exit(1);
  }
  const port = parseInt(process.argv[2] || process.env.PORT || '3100', 10);
  const srv = await H.start();
  await seed(srv.call);
  await srv.stop();
  const http = srv.app.listen(port, '127.0.0.1', () => {
    console.log(`dev server ready on http://127.0.0.1:${port}${process.env.BASE_URL || ''}`);
  });
  const shutdown = () => http.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
