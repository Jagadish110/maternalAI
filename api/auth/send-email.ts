import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, name, type } = req.body;
    const resendKey = process.env.RESEND_API_KEY;

    if (!resendKey) {
      return res.status(500).json({ error: "Email service not configured." });
    }
    if (!email || !type) {
      return res.status(400).json({ error: "Email and type are required." });
    }

    const displayName = name || email.split("@")[0];
    const isSignup = type === "signup";

    const subject = isSignup
      ? "🌸 Welcome to PreCare — Your Secure Pregnancy Companion"
      : "🔐 PreCare — New Sign-In Detected";

    const htmlBody = isSignup
      ? `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to PreCare</title></head>
<body style="margin:0;padding:0;background:#fdf8f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f4;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fefaf6;border:1px solid #f3e9df;border-radius:24px;overflow:hidden;max-width:560px;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#EB1367,#FF5E9B);padding:36px 40px;text-align:center;">
          <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <span style="font-size:28px;">🌸</span>
          </div>
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Welcome to PreCare</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Secure Pregnancy Care Platform</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;color:#5a4d44;font-size:16px;">Dear <strong style="color:#EB1367;">${displayName}</strong>,</p>
          <p style="margin:0 0 24px;color:#72645a;font-size:15px;line-height:1.7;">Your account has been successfully created. You now have secure access to the full PreCare pregnancy care suite.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF2F6;border:1px solid #FFCCD8;border-radius:16px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#EB1367;text-transform:uppercase;letter-spacing:0.5px;">What you can do now:</p>
              <table cellpadding="0" cellspacing="0"><tbody>
                <tr><td style="padding:6px 0;"><span style="color:#EB1367;margin-right:10px;">🔬</span><span style="color:#5a4d44;font-size:14px;">Upload &amp; analyze pregnancy reports with NVIDIA AI</span></td></tr>
                <tr><td style="padding:6px 0;"><span style="color:#EB1367;margin-right:10px;">📊</span><span style="color:#5a4d44;font-size:14px;">Get plain-language summaries of lab biomarkers</span></td></tr>
                <tr><td style="padding:6px 0;"><span style="color:#EB1367;margin-right:10px;">🗺️</span><span style="color:#5a4d44;font-size:14px;">Find nearby gynecologists &amp; maternity clinics</span></td></tr>
                <tr><td style="padding:6px 0;"><span style="color:#EB1367;margin-right:10px;">🔒</span><span style="color:#5a4d44;font-size:14px;">HIPAA-compliant, encrypted secure storage</span></td></tr>
              </tbody></table>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;color:#72645a;font-size:13px;">If you didn't create this account, please ignore this email — your email has not been shared with anyone.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#fdf8f4;border-top:1px solid #f3e9df;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#a09080;font-size:12px;">© 2026 PreCare · Secure Pregnancy Care · HIPAA Compliant</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      : `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>New Sign-In to PreCare</title></head>
<body style="margin:0;padding:0;background:#fdf8f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f4;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fefaf6;border:1px solid #f3e9df;border-radius:24px;overflow:hidden;max-width:560px;">
        <tr><td style="background:linear-gradient(135deg,#4a7c6a,#618266);padding:36px 40px;text-align:center;">
          <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <span style="font-size:28px;">🔐</span>
          </div>
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">New Sign-In Detected</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">PreCare Account Security</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;color:#5a4d44;font-size:16px;">Hello <strong style="color:#618266;">${displayName}</strong>,</p>
          <p style="margin:0 0 24px;color:#72645a;font-size:15px;line-height:1.7;">A new sign-in to your PreCare account was detected. If this was you, no action is required.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f9f6;border:1px solid #e8efe8;border-radius:16px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#618266;text-transform:uppercase;letter-spacing:0.5px;">Sign-In Details:</p>
              <p style="margin:0;color:#5a4d44;font-size:14px;">🕐 Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (IST)</p>
              <p style="margin:4px 0 0;color:#5a4d44;font-size:14px;">📧 Account: ${email}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;color:#72645a;font-size:13px;"><strong>Didn't sign in?</strong> Please change your password immediately to secure your account.</p>
        </td></tr>
        <tr><td style="background:#fdf8f4;border-top:1px solid #f3e9df;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#a09080;font-size:12px;">© 2026 PreCare · Secure Pregnancy Care · HIPAA Compliant</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PreCare <onboarding@resend.dev>",
        to: [email],
        subject,
        html: htmlBody,
      }),
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend API error:", resendData);
      return res.status(500).json({ error: "Failed to send confirmation email.", details: resendData });
    }

    console.log(`[Resend] ${type} confirmation email sent to ${email}, id: ${resendData.id}`);
    return res.json({ success: true, id: resendData.id });
  } catch (error: any) {
    console.error("Error sending email:", error);
    return res.status(500).json({ error: error.message || "Email send failed." });
  }
}
