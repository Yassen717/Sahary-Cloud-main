// @ts-nocheck
/**
 * DDoS Protection Service
 *
 * Thin re-export of the shared DDoS protection singleton that backs the
 * request-path middleware (middlewares/ddosProtection). The previous
 * implementation kept a private in-memory map that nothing on the request
 * path consulted, so admin "block IP" calls were a no-op. Importing the
 * middleware singleton ensures blocks land in the real block store
 * (Redis `ddos:blocked:*` keys + expiring in-memory mirror).
 */
const { ddosProtection, DDoSProtection } = require('../middlewares/ddosProtection');

module.exports = {
  ddosProtection,
  DDoSProtectionService: DDoSProtection,
};
