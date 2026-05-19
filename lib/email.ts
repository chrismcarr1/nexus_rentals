import "server-only";

type PasswordResetEmailInput = {
  to: string;
  name: string;
  resetUrl: string;
};

function getEmailFromAddress() {
  return process.env.RESET_EMAIL_FROM || "Northstar Rent OS <no-reply@northstar.local>";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPasswordResetEmail({ to, name, resetUrl }: PasswordResetEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getEmailFromAddress();
  const safeName = escapeHtml(name);
  const safeResetUrl = escapeHtml(resetUrl);

  if (!apiKey) {
    console.info(`[email] RESEND_API_KEY is not configured. Password reset link for ${to}: ${resetUrl}`);
    return { sent: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject: "Reset your Northstar Rent OS password",
      html: `
        <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
          <h1 style="font-size: 22px;">Reset your password</h1>
          <p>Hi ${safeName},</p>
          <p>We received a request to reset your Northstar Rent OS password. This link expires in 1 hour.</p>
          <p>
            <a href="${safeResetUrl}" style="display: inline-block; border-radius: 12px; background: #1f6b5f; color: #ffffff; padding: 12px 18px; text-decoration: none; font-weight: 700;">
              Reset password
            </a>
          </p>
          <p>If you did not request this, you can ignore this email.</p>
          <p style="font-size: 12px; color: #5f6b7d;">${safeResetUrl}</p>
        </div>
      `,
      text: `Hi ${name},\n\nReset your Northstar Rent OS password using this link. It expires in 1 hour:\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Password reset email failed: ${response.status} ${detail}`);
  }

  return { sent: true };
}
