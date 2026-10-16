import {
  accountProvisionedEmail,
  accountReactivatedEmail,
  accountSuspendedEmail,
  paymentFailedEmail,
  quotaAlertEmail,
  sslExpiringEmail,
  sslFailedEmail,
  sslIssuedEmail,
  subscriptionCanceledEmail,
} from '../../src/services/hostingEmailTemplates';

const ARABIC = /[؀-ۿ]/;

const expectBilingual = (tpl: { subject: string; text: string; html: string }) => {
  expect(tpl.subject.length).toBeGreaterThan(0);
  expect(tpl.text.length).toBeGreaterThan(0);
  expect(tpl.html).toContain('dir="ltr"');
  expect(tpl.html).toContain('dir="rtl"');
  expect(tpl.html).toMatch(ARABIC);
  expect(tpl.text).toMatch(ARABIC);
};

describe('hostingEmailTemplates', () => {
  test('every template produces a bilingual subject/text/html', () => {
    const all = [
      accountProvisionedEmail({ name: 'Ada', domain: 'a.sahary.cloud', siteUrl: 'https://a.sahary.cloud', dashboardUrl: 'https://app/h' }),
      accountSuspendedEmail({ name: 'Ada', domain: 'a.sahary.cloud', reason: 'ADMIN', billingUrl: 'https://app/b', dashboardUrl: 'https://app/h' }),
      accountReactivatedEmail({ name: 'Ada', domain: 'a.sahary.cloud', dashboardUrl: 'https://app/h' }),
      paymentFailedEmail({ name: 'Ada', domain: 'a.sahary.cloud', nextRetryAt: new Date('2026-10-20T00:00:00Z'), hostedInvoiceUrl: 'https://pay.stripe.com/i/1', billingUrl: 'https://app/b' }),
      subscriptionCanceledEmail({ name: 'Ada', domain: 'a.sahary.cloud', endsAt: new Date('2026-11-01T00:00:00Z'), billingUrl: 'https://app/b' }),
      quotaAlertEmail({ name: 'Ada', domain: 'a.sahary.cloud', resource: 'disk', percent: 80, usedGB: 4, quotaGB: 5, filesUrl: 'https://app/f', billingUrl: 'https://app/b' }),
      quotaAlertEmail({ name: 'Ada', domain: 'a.sahary.cloud', resource: 'bandwidth', percent: 100, usedGB: 50, quotaGB: 50, filesUrl: 'https://app/f', billingUrl: 'https://app/b' }),
      sslIssuedEmail({ name: 'Ada', domain: 'a.example.com', siteUrl: 'https://a.example.com' }),
      sslExpiringEmail({ name: 'Ada', domain: 'a.example.com', daysLeft: 7, dashboardUrl: 'https://app/h' }),
      sslFailedEmail({ name: 'Ada', domain: 'a.example.com', reason: 'dns timeout', dashboardUrl: 'https://app/h' }),
    ];
    expect(all).toHaveLength(10);
    all.forEach(expectBilingual);
  });

  test('hostile name/domain values are HTML-escaped everywhere', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const tpl = accountProvisionedEmail({
      name: hostile,
      domain: '<script>alert(2)</script>.sahary.cloud',
      siteUrl: 'https://x.sahary.cloud',
      dashboardUrl: 'https://app/h',
    });
    expect(tpl.html).not.toContain('<img src=x');
    expect(tpl.html).not.toContain('<script>alert(2)');
    expect(tpl.html).toContain('&lt;img src=x');
    expect(tpl.html).toContain('&lt;script&gt;');
    // The raw payload never reaches either body.
    expect(tpl.text).not.toContain('<img src=x');
  });

  test('suspend email picks the right recovery link per reason', () => {
    const billing = 'https://app.test/dashboard/subscription';
    const payment = accountSuspendedEmail({ name: 'A', domain: 'd.x', reason: 'PAYMENT_FAILED', billingUrl: billing, dashboardUrl: 'https://app/h' });
    expect(payment.html).toContain(billing);
    expect(payment.text).toContain('payment');

    const bandwidth = accountSuspendedEmail({ name: 'A', domain: 'd.x', reason: 'BANDWIDTH_EXCEEDED', billingUrl: billing, dashboardUrl: 'https://app/h' });
    expect(bandwidth.html).toContain(billing);
    expect(bandwidth.text).toContain('bandwidth');

    const canceled = accountSuspendedEmail({ name: 'A', domain: 'd.x', reason: 'SUBSCRIPTION_CANCELED', billingUrl: billing, dashboardUrl: 'https://app/h' });
    expect(canceled.html).toContain(billing);

    const admin = accountSuspendedEmail({ name: 'A', domain: 'd.x', reason: 'ADMIN', billingUrl: billing, dashboardUrl: 'https://app/h' });
    // Admin suspensions offer no self-service link — contact support instead.
    expect(admin.html).not.toContain(billing);
    expect(admin.text).toContain('support');
  });

  test('payment failed includes retry date and hosted invoice link when provided', () => {
    const withInvoice = paymentFailedEmail({
      name: 'A', domain: 'd.x',
      nextRetryAt: new Date('2026-10-20T12:00:00Z'),
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/abc',
      billingUrl: 'https://app/b',
    });
    expect(withInvoice.text).toContain('2026-10-20');
    expect(withInvoice.html).toContain('https://invoice.stripe.com/i/abc');

    const withoutInvoice = paymentFailedEmail({
      name: 'A', domain: 'd.x', nextRetryAt: null, hostedInvoiceUrl: null, billingUrl: 'https://app/b',
    });
    expect(withoutInvoice.html).not.toContain('invoice.stripe.com');
    expect(withoutInvoice.text).not.toContain('undefined');
  });

  test('quota alert links: disk gets file manager, bandwidth gets upgrade only', () => {
    const disk = quotaAlertEmail({ name: 'A', domain: 'd.x', resource: 'disk', percent: 80, usedGB: 4, quotaGB: 5, filesUrl: 'https://app/files', billingUrl: 'https://app/sub' });
    expect(disk.html).toContain('https://app/files');
    expect(disk.html).toContain('https://app/sub');
    expect(disk.text).toContain('4 GB of 5 GB');

    const bw = quotaAlertEmail({ name: 'A', domain: 'd.x', resource: 'bandwidth', percent: 100, usedGB: 51, quotaGB: 50, filesUrl: 'https://app/files', billingUrl: 'https://app/sub' });
    expect(bw.html).not.toContain('https://app/files');
    expect(bw.html).toContain('https://app/sub');
  });

  test('ssl templates carry domain and context', () => {
    const expiring = sslExpiringEmail({ name: 'A', domain: 'cert.example.com', daysLeft: 7, dashboardUrl: 'https://app/h' });
    expect(expiring.text).toContain('cert.example.com');
    expect(expiring.text).toContain('7');

    const failed = sslFailedEmail({ name: 'A', domain: 'cert.example.com', reason: 'NXDOMAIN', dashboardUrl: 'https://app/h' });
    expect(failed.text).toContain('NXDOMAIN');
  });
});
