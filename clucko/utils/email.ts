// Sends the reset code via EmailJS's plain REST API — no SDK needed, works
// fine from Expo/React Native since it's just a POST request.
const EMAILJS_SERVICE_ID = 'service_lzrjxzb';
const EMAILJS_TEMPLATE_ID = 'template_u0b0yl9';
const EMAILJS_PUBLIC_KEY = 'lJJPMqktLrmyBcQBJ';

export async function sendResetCodeEmail(toEmail: string, code: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    return response.ok;
  } catch (error) {
    console.error('Error sending reset code email:', error);
    return false;
  }
}