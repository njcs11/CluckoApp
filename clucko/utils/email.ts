import { apiSendResetCode } from '../lib/api';

// Sends the reset code via EmailJS's REST API with browser-compatible Origin header,
// with automatic server-side fallback if network or origin restrictions occur.
const EMAILJS_SERVICE_ID = 'service_lzrjxzb';
const EMAILJS_TEMPLATE_ID = 'template_u0b0yl9';
const EMAILJS_PUBLIC_KEY = 'lJJPMqktLrmyBcQBJ';

export async function sendResetCodeEmail(toEmail: string, code: string): Promise<boolean> {
  const normalizedEmail = toEmail.trim().toLowerCase();

  // 1. ALWAYS register the verification code with the backend first!
  let serverRegistered = false;
  try {
    const serverSent = await apiSendResetCode(normalizedEmail, code);
    if (serverSent) {
      serverRegistered = true;
    }
  } catch (serverErr) {
    console.warn('Backend proxy send failed, attempting direct EmailJS:', serverErr);
  }

  // If server-side dispatch already succeeded, we are done!
  if (serverRegistered) {
    return true;
  }

  // 2. Client-side EmailJS dispatch fallback
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
          to_email: normalizedEmail,
          code,
        },
      }),
    });

    if (response.ok) {
      return true;
    }
  } catch (error) {
    console.warn('Direct EmailJS send failed:', error);
  }

  return serverRegistered;
}