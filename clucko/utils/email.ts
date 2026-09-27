import { apiSendResetCode } from '../lib/api';

// Sends the reset code via EmailJS's REST API with browser-compatible Origin header,
// with automatic server-side fallback if network or origin restrictions occur.
const EMAILJS_SERVICE_ID = 'service_lzrjxzb';
const EMAILJS_TEMPLATE_ID = 'template_u0b0yl9';
const EMAILJS_PUBLIC_KEY = 'lJJPMqktLrmyBcQBJ';

export async function sendResetCodeEmail(toEmail: string, code: string): Promise<boolean> {
  // 1. First attempt: Direct EmailJS with Origin header
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost',
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: toEmail,
          code,
        },
      }),
    });

    if (response.ok) {
      return true;
    }
  } catch (error) {
    console.warn('Direct EmailJS send failed, falling back to server dispatch:', error);
  }

  // 2. Second attempt: Backend proxy
  try {
    const serverSent = await apiSendResetCode(toEmail, code);
    if (serverSent) {
      return true;
    }
  } catch (serverErr) {
    console.error('Server-side email dispatch failed:', serverErr);
  }

  return false;
}