const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Email Service
 * Handles sending emails using nodemailer
 */
class EmailService {
    constructor() {
        this.transporter = null;
        this.initialized = false;
    }

    /**
     * Initialize email transporter
     */
    async initialize() {
        try {
            // Create transporter based on environment configuration
            if (process.env.EMAIL_SERVICE === 'gmail') {
                this.transporter = nodemailer.createTransporter({
                    service: 'gmail',
                    auth: {
                        user: process.env.EMAIL_USER,
                        pass: process.env.EMAIL_PASSWORD,
                    },
                });
            } else if (process.env.SMTP_HOST) {
                this.transporter = nodemailer.createTransporter({
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT || 587,
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASSWORD,
                    },
                });
            } else {
                // Development mode - use ethereal email (fake SMTP service)
                logger.warn('No email configuration found, using development mode (no emails will be sent)');
                this.transporter = null;
                this.initialized = false;
                return;
            }

            // Verify connection
            if (this.transporter) {
                await this.transporter.verify();
                this.initialized = true;
                logger.info('Email service initialized successfully');
            }
        } catch (error) {
            logger.error('Failed to initialize email service:', error);
            this.initialized = false;
            this.transporter = null;
        }
    }

    /**
     * Send email
     * @param {Object} options - Email options
     * @param {string} options.to - Recipient email
     * @param {string} options.subject - Email subject
     * @param {string} options.text - Plain text content
     * @param {string} options.html - HTML content
     */
    async sendEmail({ to, subject, text, html }) {
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
                    mode: 'development',
                    message: 'Email logged (not sent in development mode)',
                };
            }

            const mailOptions = {
                from: process.env.EMAIL_FROM || 'noreply@saharycloud.com',
                to,
                subject,
                text,
                html: html || text,
            };

            const info = await this.transporter.sendMail(mailOptions);

            logger.info(`Email sent successfully to ${to}: ${subject}`);

            return {
                success: true,
                messageId: info.messageId,
                message: 'Email sent successfully',
            };
        } catch (error) {
            logger.error('Failed to send email:', error);
            return {
                success: false,
                error: error.message,
                message: 'Failed to send email',
            };
        }
    }

    /**
     * Send verification email
     */
    async sendVerificationEmail(to, verificationToken, userName) {
        const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

        const html = `
      <h1>Welcome to Sahary Cloud, ${userName}!</h1>
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
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

        const html = `
      <h1>Password Reset Request</h1>
      <p>Hi ${userName},</p>
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
