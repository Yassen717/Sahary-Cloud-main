// @ts-nocheck
const nodemailer = require('nodemailer');
const logger = require('../utils/logger').default;
const config = require('../config').default;

/**
 * Escape user-supplied text before interpolating it into HTML emails
 * @param {*} value - Value to escape
 * @returns {string} HTML-escaped string
 */
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

/**
 * Email Service
 * Handles sending emails using nodemailer
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
    // Memoized in-flight initialize() promise so concurrent senders share
    // a single connect + verify attempt
    this.initPromise = null;
    // Timestamp of the last initialization attempt; failed/unconfigured
    // attempts are cached for initRetryMs before retrying
    this.lastInitAttempt = 0;
    this.initRetryMs = 60 * 1000;
    this.warnedMissingFrontendUrl = false;
  }

  /**
     * Initialize email transporter.
     * Safe to call concurrently - the first call performs the real
     * initialization and concurrent callers await the same promise.
     * A successful verify() is cached via this.initialized; a failed attempt
     * is cached for initRetryMs so a broken SMTP config does not trigger a
     * TCP connect + verify on every send.
     */
  async initialize() {
    // Already verified - do not re-verify on every send
    if (this.initialized && this.transporter) {
      return;
    }

    // Share a single in-flight initialization across concurrent callers
    if (this.initPromise) {
      return this.initPromise;
    }

    // Cooldown after a failed/unconfigured attempt
    if (Date.now() - this.lastInitAttempt < this.initRetryMs) {
      return;
    }
    this.lastInitAttempt = Date.now();

    this.initPromise = (async () => {
      try {
        // Create transporter based on environment configuration
        if (process.env.EMAIL_SERVICE === 'gmail') {
          this.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
              // EMAIL_USER/EMAIL_PASSWORD are legacy names;
              // SMTP_USER/SMTP_PASS are the schema'd ones
              user: process.env.EMAIL_USER || config.email.smtp.auth.user,
              pass: process.env.EMAIL_PASSWORD || config.email.smtp.auth.pass,
            },
          });
        } else if (process.env.SMTP_HOST) {
          this.transporter = nodemailer.createTransport({
            host: config.email.smtp.host,
            port: Number(config.email.smtp.port),
            secure: config.email.smtp.secure,
            auth: {
              user: config.email.smtp.auth.user,
              pass: config.email.smtp.auth.pass,
            },
          });
        } else {
          // Development mode - emails are logged, not sent
          logger.warn('No email configuration found, using development mode (no emails will be sent)');
          this.transporter = null;
          this.initialized = false;
          return;
        }

        // Verify connection once; success is cached via this.initialized
        if (this.transporter) {
          await this.transporter.verify();
          this.initialized = true;
          logger.info('Email service initialized successfully');
        }
      } catch (error) {
        logger.error('Failed to initialize email service:', error);
        this.initialized = false;
        this.transporter = null;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  /**
     * "From" address for outgoing mail in "Name <email>" format.
     * EMAIL_FROM is kept as a legacy override; FROM_EMAIL/FROM_NAME are the
     * schema'd names.
     */
  _fromAddress() {
    return process.env.EMAIL_FROM || `${config.email.from.name} <${config.email.from.email}>`;
  }

  /**
     * Frontend base URL for links in outgoing emails. Falls back to the
     * configured default and warns once when FRONTEND_URL is unset, so emails
     * never contain 'undefined/verify-email?...' links.
     */
  _frontendUrl() {
    if (!process.env.FRONTEND_URL && !this.warnedMissingFrontendUrl) {
      this.warnedMissingFrontendUrl = true;
      logger.warn(`FRONTEND_URL is not set; email links will use fallback ${config.urls.frontend}`);
    }
    return config.urls.frontend;
  }

  /**
     * Send email
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {string} options.subject - Email subject
     * @param {string} options.text - Plain text content
     * @param {string} options.html - HTML content
     * @returns {Promise<{success: boolean, sent: boolean, mode?: string, messageId?: string, error?: string, message: string}>}
     *   This method never rejects - callers must inspect the result:
     *   - Real send:    { success: true,  sent: true,  messageId }
     *   - Dev-mode skip (no SMTP configured, email only logged):
     *                   { success: true,  sent: false, mode: 'development' }
     *   - Failure:      { success: false, sent: false, error }
     */
  async sendEmail({
    to, subject, text, html,
  }) {
    try {
      // Initialize if not already done
      if (!this.initialized) {
        await this.initialize();
      }

      // If still not initialized (no config), log and skip
      if (!this.transporter) {
        logger.info(`[DEV MODE] Would send email to ${to}: ${subject}`);
        return {
          success: true,
          sent: false,
          mode: 'development',
          message: 'Email logged (not sent in development mode)',
        };
      }

      const mailOptions = {
        from: this._fromAddress(),
        to,
        subject,
        text,
        html: html || text,
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info(`Email sent successfully to ${to}: ${subject}`);

      return {
        success: true,
        sent: true,
        messageId: info.messageId,
        message: 'Email sent successfully',
      };
    } catch (error) {
      logger.error('Failed to send email:', error);
      return {
        success: false,
        sent: false,
        error: error.message,
        message: 'Failed to send email',
      };
    }
  }

  /**
     * Send verification email
     */
  async sendVerificationEmail(to, verificationToken, userName) {
    const verificationUrl = `${this._frontendUrl()}/verify-email?token=${verificationToken}`;
    const safeName = escapeHtml(userName);

    const html = `
      <h1>Welcome to Sahary Cloud, ${safeName}!</h1>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verificationUrl}">Verify Email</a>
      <p>Or copy and paste this link in your browser:</p>
      <p>${verificationUrl}</p>
      <p>This link will expire in 24 hours.</p>
    `;

    return this.sendEmail({
      to,
      subject: 'Verify your Sahary Cloud email',
      html,
      text: `Welcome to Sahary Cloud! Please verify your email: ${verificationUrl}`,
    });
  }

  /**
     * Send password reset email
     */
  async sendPasswordResetEmail(to, resetToken, userName) {
    const resetUrl = `${this._frontendUrl()}/reset-password?token=${resetToken}`;
    const safeName = escapeHtml(userName);

    const html = `
      <h1>Password Reset Request</h1>
      <p>Hi ${safeName},</p>
      <p>We received a request to reset your password. Click the link below to create a new password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>Or copy and paste this link in your browser:</p>
      <p>${resetUrl}</p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    return this.sendEmail({
      to,
      subject: 'Reset your Sahary Cloud password',
      html,
      text: `Password reset request: ${resetUrl}`,
    });
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;
