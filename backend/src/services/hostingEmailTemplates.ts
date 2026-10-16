// Bilingual (English + Arabic) email bodies for hosting notifications (P10).
// Pure functions: callers resolve every URL and pass them in. Every
// user-controlled value interpolated into HTML is escaped.

import type { SuspendReason } from '../types/hosting';

export interface HostingEmailTemplate {
  subject: string;
  text: string;
  html: string;
}

interface EmailCta {
  href: string;
  labelEn: string;
  labelAr: string;
}

interface EmailBody {
  en: string[];
  ar: string[];
}

const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch] ?? ch);

const renderCtas = (ctas: EmailCta[], label: 'labelEn' | 'labelAr'): string =>
  ctas
    .map(
      (cta) =>
        `<p><a href="${esc(cta.href)}" style="color:#0b62d6">${esc(cta[label])}</a></p>`,
    )
    .join('');

const renderSection = (lines: string[], ctas: EmailCta[], label: 'labelEn' | 'labelAr'): string =>
  `${lines.map((line) => `<p>${line}</p>`).join('')}${renderCtas(ctas, label)}`;

const render = (subjectEn: string, subjectAr: string, body: EmailBody, ctas: EmailCta[] = []): HostingEmailTemplate => ({
  subject: `${subjectEn} / ${subjectAr}`,
  text: `${body.en.join('\n')}${ctas.map((c) => `\n${c.labelEn}: ${c.href}`).join('')}\n\n---\n\n${body.ar.join('\n')}${ctas
    .map((c) => `\n${c.labelAr}: ${c.href}`)
    .join('')}`,
  html:
    `<div dir="ltr" lang="en">${renderSection(body.en, ctas, 'labelEn')}</div>` +
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />' +
    `<div dir="rtl" lang="ar">${renderSection(body.ar, ctas, 'labelAr')}</div>`,
});

const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

const greetEn = (name: string): string => `Hi ${esc(name)},`;
const greetAr = (name: string): string => `مرحبًا ${esc(name)}،`;

export function accountProvisionedEmail(input: {
  name: string;
  domain: string;
  siteUrl: string;
  dashboardUrl: string;
}): HostingEmailTemplate {
  return render(
    'Your hosting account is ready',
    'حساب الاستضافة الخاص بك جاهز',
    {
      en: [
        greetEn(input.name),
        `Your site <b>${esc(input.domain)}</b> has been provisioned and is live at ${esc(input.siteUrl)}.`,
        'Next steps: upload your files, add a custom domain, or create a database from your hosting dashboard.',
      ],
      ar: [
        greetAr(input.name),
        `تم تجهيز موقعك <b>${esc(input.domain)}</b> وهو الآن متاح على ${esc(input.siteUrl)}.`,
        'الخطوات التالية: ارفع ملفاتك، أو اربط نطاقًا مخصصًا، أو أنشئ قاعدة بيانات من لوحة الاستضافة.',
      ],
    },
    [{ href: input.dashboardUrl, labelEn: 'Open hosting dashboard', labelAr: 'فتح لوحة الاستضافة' }],
  );
}

export function accountSuspendedEmail(input: {
  name: string;
  domain: string;
  reason: SuspendReason;
  billingUrl: string;
  dashboardUrl: string;
}): HostingEmailTemplate {
  const ctas: EmailCta[] = [];
  let enReason = 'Your account was suspended by an administrator. Contact support if you believe this is a mistake.';
  let arReason = 'تم تعليق حسابك من قبل الإدارة. تواصل مع الدعم إذا كنت تعتقد أن هذا خطأ.';

  switch (input.reason) {
    case 'PAYMENT_FAILED':
      enReason = 'Your latest subscription payment failed. Update your payment method to restore service.';
      arReason = 'فشل آخر دفع لاشتراكك. حدّث وسيلة الدفع لاستعادة الخدمة.';
      ctas.push({ href: input.billingUrl, labelEn: 'Update payment method', labelAr: 'تحديث وسيلة الدفع' });
      break;
    case 'BANDWIDTH_EXCEEDED':
      enReason = 'Your monthly bandwidth quota was exceeded. Upgrade your plan to restore service immediately.';
      arReason = 'تم تجاوز حصة النطاق الشهرية لحسابك. قم بترقية خطتك لاستعادة الخدمة فورًا.';
      ctas.push({ href: input.billingUrl, labelEn: 'Upgrade plan', labelAr: 'ترقية الخطة' });
      break;
    case 'SUBSCRIPTION_CANCELED':
      enReason = 'Your subscription was canceled. Resubscribe to restore your site.';
      arReason = 'تم إلغاء اشتراكك. أعد الاشتراك لاستعادة موقعك.';
      ctas.push({ href: input.billingUrl, labelEn: 'Manage subscription', labelAr: 'إدارة الاشتراك' });
      break;
    case 'ADMIN':
    case 'ABUSE':
    default:
      break;
  }

  return render(
    'Your hosting account was suspended',
    'تم تعليق حساب الاستضافة الخاص بك',
    {
      en: [
        greetEn(input.name),
        `Your hosting account for <b>${esc(input.domain)}</b> has been suspended.`,
        enReason,
      ],
      ar: [
        greetAr(input.name),
        `تم تعليق حساب الاستضافة الخاص بموقع <b>${esc(input.domain)}</b>.`,
        arReason,
      ],
    },
    ctas,
  );
}

export function accountReactivatedEmail(input: {
  name: string;
  domain: string;
  dashboardUrl: string;
}): HostingEmailTemplate {
  return render(
    'Your hosting account is active again',
    'تمت إعادة تفعيل حساب الاستضافة الخاص بك',
    {
      en: [
        greetEn(input.name),
        `Good news — your hosting account for <b>${esc(input.domain)}</b> is active again.`,
        'Your site and services are back online.',
      ],
      ar: [
        greetAr(input.name),
        `خبر جيد — تمت إعادة تفعيل حساب الاستضافة الخاص بموقع <b>${esc(input.domain)}</b>.`,
        'عاد موقعك وخدماتك للعمل.',
      ],
    },
    [{ href: input.dashboardUrl, labelEn: 'Open hosting dashboard', labelAr: 'فتح لوحة الاستضافة' }],
  );
}

export function paymentFailedEmail(input: {
  name: string;
  domain: string;
  nextRetryAt: Date | null;
  hostedInvoiceUrl: string | null;
  billingUrl: string;
}): HostingEmailTemplate {
  const ctas: EmailCta[] = [{ href: input.billingUrl, labelEn: 'Update payment method', labelAr: 'تحديث وسيلة الدفع' }];
  if (input.hostedInvoiceUrl) {
    ctas.push({ href: input.hostedInvoiceUrl, labelEn: 'View invoice', labelAr: 'عرض الفاتورة' });
  }

  const enRetry = input.nextRetryAt
    ? `We will try to collect the payment again on ${dateOnly(input.nextRetryAt)}.`
    : 'We will try to collect the payment again automatically.';
  const arRetry = input.nextRetryAt
    ? `سنحاول تحصيل الدفعة مرة أخرى في ${dateOnly(input.nextRetryAt)}.`
    : 'سنحاول تحصيل الدفعة مرة أخرى تلقائيًا.';

  return render(
    'Payment failed for your hosting subscription',
    'فشل دفع اشتراك الاستضافة',
    {
      en: [
        greetEn(input.name),
        `We could not collect the subscription payment for <b>${esc(input.domain)}</b>.`,
        enRetry,
        'Your site stays online during the grace period, but please update your payment method to avoid suspension.',
      ],
      ar: [
        greetAr(input.name),
        `تعذر تحصيل دفعة اشتراكك لموقع <b>${esc(input.domain)}</b>.`,
        arRetry,
        'سيبقى موقعك يعمل خلال فترة السماح، لكن يرجى تحديث وسيلة الدفع لتجنب تعليق الحساب.',
      ],
    },
    ctas,
  );
}

export function subscriptionCanceledEmail(input: {
  name: string;
  domain: string;
  endsAt: Date | null;
  billingUrl: string;
}): HostingEmailTemplate {
  const enUntil = input.endsAt
    ? `Your site stays active until ${dateOnly(input.endsAt)}.`
    : 'Your site stays active until the end of the current billing period.';
  const arUntil = input.endsAt
    ? `سيبقى موقعك نشطًا حتى ${dateOnly(input.endsAt)}.`
    : 'سيبقى موقعك نشطًا حتى نهاية دورة الفوترة الحالية.';

  return render(
    'Your hosting subscription was canceled',
    'تم إلغاء اشتراك الاستضافة الخاص بك',
    {
      en: [
        greetEn(input.name),
        `Your subscription for <b>${esc(input.domain)}</b> was canceled.`,
        enUntil,
        'After that the account will be suspended and later removed.',
      ],
      ar: [
        greetAr(input.name),
        `تم إلغاء اشتراكك لموقع <b>${esc(input.domain)}</b>.`,
        arUntil,
        'بعد ذلك سيتم تعليق الحساب ثم حذفه لاحقًا.',
      ],
    },
    [{ href: input.billingUrl, labelEn: 'Manage subscription', labelAr: 'إدارة الاشتراك' }],
  );
}

export function quotaAlertEmail(input: {
  name: string;
  domain: string;
  resource: 'disk' | 'bandwidth';
  percent: 80 | 100;
  usedGB: number;
  quotaGB: number;
  filesUrl: string;
  billingUrl: string;
}): HostingEmailTemplate {
  const used = `${input.usedGB} GB`;
  const quota = `${input.quotaGB} GB`;

  const enLine =
    input.resource === 'disk'
      ? `Your disk usage for <b>${esc(input.domain)}</b> reached ${input.percent}% (${esc(used)} of ${esc(quota)}).`
      : `Your monthly bandwidth usage for <b>${esc(input.domain)}</b> reached ${input.percent}% (${esc(used)} of ${esc(quota)}).`;
  const arLine =
    input.resource === 'disk'
      ? `وصل استخدام القرص لموقع <b>${esc(input.domain)}</b> إلى ${input.percent}٪ (${esc(used)} من ${esc(quota)}).`
      : `وصل استهلاك النطاق الشهري لموقع <b>${esc(input.domain)}</b> إلى ${input.percent}٪ (${esc(used)} من ${esc(quota)}).`;

  const enNext =
    input.resource === 'disk'
      ? input.percent >= 100
        ? 'File uploads are blocked until you free space or upgrade your plan.'
        : 'Free up space or upgrade your plan before the disk is full.'
      : input.percent >= 100
        ? 'Your account may be suspended until the next billing cycle or until you upgrade your plan.'
        : 'Upgrade your plan to avoid suspension when usage reaches 100%.';
  const arNext =
    input.resource === 'disk'
      ? input.percent >= 100
        ? 'تم إيقاف رفع الملفات حتى تحرير مساحة أو ترقية الخطة.'
        : 'حرر مساحة أو قم بترقية خطتك قبل امتلاء القرص.'
      : input.percent >= 100
        ? 'قد يتم تعليق حسابك حتى دورة الفوترة التالية أو حتى ترقية خطتك.'
        : 'قم بترقية خطتك لتجنب تعليق الحساب عند بلوغ الاستهلاك 100٪.';

  const ctas: EmailCta[] = [{ href: input.billingUrl, labelEn: 'Upgrade plan', labelAr: 'ترقية الخطة' }];
  if (input.resource === 'disk') {
    ctas.unshift({ href: input.filesUrl, labelEn: 'Open file manager', labelAr: 'فتح مدير الملفات' });
  }

  const resourceEn = input.resource === 'disk' ? 'disk' : 'bandwidth';
  const resourceAr = input.resource === 'disk' ? 'القرص' : 'النطاق';

  return render(
    `Your hosting ${resourceEn} usage reached ${input.percent}%`,
    `بلغ استخدام ${resourceAr} في حسابك ${input.percent}٪`,
    {
      en: [greetEn(input.name), enLine, enNext],
      ar: [greetAr(input.name), arLine, arNext],
    },
    ctas,
  );
}

export function sslIssuedEmail(input: {
  name: string;
  domain: string;
  siteUrl: string;
}): HostingEmailTemplate {
  return render(
    'HTTPS is now active for your domain',
    'تم تفعيل HTTPS لنطاقك',
    {
      en: [
        greetEn(input.name),
        `The SSL certificate for <b>${esc(input.domain)}</b> was issued.`,
        `Your site is now served securely at ${esc(input.siteUrl)}.`,
      ],
      ar: [
        greetAr(input.name),
        `تم إصدار شهادة SSL لموقع <b>${esc(input.domain)}</b>.`,
        `أصبح موقعك يعمل بشكل آمن على ${esc(input.siteUrl)}.`,
      ],
    },
  );
}

export function sslExpiringEmail(input: {
  name: string;
  domain: string;
  daysLeft: number;
  dashboardUrl: string;
}): HostingEmailTemplate {
  return render(
    `Your SSL certificate expires in ${input.daysLeft} days`,
    `تنتهي صلاحية شهادة SSL خلال ${input.daysLeft} يومًا`,
    {
      en: [
        greetEn(input.name),
        `The SSL certificate for <b>${esc(input.domain)}</b> expires in ${input.daysLeft} days.`,
        'We will keep trying to renew it automatically. No action is needed unless renewal keeps failing.',
      ],
      ar: [
        greetAr(input.name),
        `تنتهي صلاحية شهادة SSL لموقع <b>${esc(input.domain)}</b> خلال ${input.daysLeft} يومًا.`,
        'سنواصل محاولة التجديد تلقائيًا. لا حاجة لأي إجراء ما لم يستمر فشل التجديد.',
      ],
    },
    [{ href: input.dashboardUrl, labelEn: 'Open hosting dashboard', labelAr: 'فتح لوحة الاستضافة' }],
  );
}

export function sslFailedEmail(input: {
  name: string;
  domain: string;
  reason: string;
  dashboardUrl: string;
}): HostingEmailTemplate {
  return render(
    'SSL certificate issuance failed',
    'فشل إصدار شهادة SSL',
    {
      en: [
        greetEn(input.name),
        `We could not issue or renew the SSL certificate for <b>${esc(input.domain)}</b>.`,
        `Reason: ${esc(input.reason)}`,
        'Check your DNS settings and try again from the hosting dashboard.',
      ],
      ar: [
        greetAr(input.name),
        `تعذر إصدار أو تجديد شهادة SSL لموقع <b>${esc(input.domain)}</b>.`,
        `السبب: ${esc(input.reason)}`,
        'تحقق من إعدادات DNS وحاول مرة أخرى من لوحة الاستضافة.',
      ],
    },
    [{ href: input.dashboardUrl, labelEn: 'Open hosting dashboard', labelAr: 'فتح لوحة الاستضافة' }],
  );
}
