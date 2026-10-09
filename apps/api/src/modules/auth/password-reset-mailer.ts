import nodemailer from 'nodemailer'
import { env } from '../../config/env.js'

export type PasswordResetMailer = {
  sendOtpEmail: (to: string, otp: string, ttlMinutes: number) => Promise<boolean>
}

export function createPasswordResetMailer(): PasswordResetMailer {
  const user = env.mail.gmailUser
  const pass = env.mail.gmailAppPassword
  const from = env.mail.from || user

  if (!user || !pass || !from) {
    return {
      async sendOtpEmail() {
        console.warn('[password-reset] SMTP is not configured; OTP email was not sent.')
        return false
      },
    }
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })

  return {
    async sendOtpEmail(to, otp, ttlMinutes) {
      await transporter.sendMail({
        from,
        to,
        subject: 'STI Ormoc Smart Library password reset code',
        text: [
          'Your STI Ormoc Smart Library password reset code is:',
          '',
          otp,
          '',
          `This code expires in ${ttlMinutes} minutes.`,
          'If you did not request a reset, you can ignore this email.',
        ].join('\n'),
      })
      return true
    },
  }
}
