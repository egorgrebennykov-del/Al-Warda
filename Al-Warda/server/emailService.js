/**
 * Email dispatch service for Litera customer support.
 * Uses EmailJS API as primary delivery to send administrator replies directly to unregistered guest users,
 * with Resend API as fallback.
 */

const EMAILJS_API_URL = "https://api.emailjs.com/api/v1.0/email/send";
const DEFAULT_EMAILJS_SERVICE_ID = "default_service";
const DEFAULT_EMAILJS_TEMPLATE_ID = "template_tco32u6";
const DEFAULT_EMAILJS_PUBLIC_KEY = "mq7sRq7QGzp9XQUTh";
const DEFAULT_EMAILJS_PRIVATE_KEY = "q20TuIwHcTj_gHXePCXIG";

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_SUPPORT_EMAIL = "litera.eu@gmail.com";
const DEFAULT_FROM = "Litera Support <onboarding@resend.dev>";

export async function sendGuestInquiryEmail({
  to,
  userName,
  subject,
  text,
  adminName,
}) {
  if (!to || !text) {
    throw new Error("Missing required email fields: to, text");
  }

  const cleanTo = String(to).trim().toLowerCase();
  const cleanUser = String(userName || "Читатель").trim();
  const cleanText = String(text).trim();
  const senderName = adminName
    ? String(adminName).trim()
    : "Служба поддержки Litera";
  const mailSubject = subject || "Ответ от службы поддержки Litera";
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    process.env.RESEND_REPLY_TO ||
    DEFAULT_SUPPORT_EMAIL;

  // 1. Primary: send directly to guest via EmailJS REST API
  const emailJsServiceId =
    process.env.VITE_EMAILJS_SERVICE_ID || DEFAULT_EMAILJS_SERVICE_ID;
  const emailJsTemplateId =
    process.env.VITE_EMAILJS_TEMPLATE_ID || DEFAULT_EMAILJS_TEMPLATE_ID;
  const emailJsPublicKey =
    process.env.VITE_EMAILJS_PUBLIC_KEY || DEFAULT_EMAILJS_PUBLIC_KEY;
  const emailJsPrivateKey =
    process.env.EMAILJS_PRIVATE_KEY || DEFAULT_EMAILJS_PRIVATE_KEY;

  if (emailJsServiceId && emailJsTemplateId && emailJsPublicKey) {
    const timeStr = new Date().toLocaleString("ru-RU");
    const templateParams = {
      to_email: cleanTo,
      email: cleanTo,
      user_email: cleanTo,
      recipient: cleanTo,
      to: cleanTo,
      to_name: cleanUser,
      user_name: cleanUser,
      name: senderName,
      from_name: senderName,
      admin_name: senderName,
      sender_name: senderName,
      subject: mailSubject,
      title: mailSubject,
      message: cleanText,
      text: cleanText,
      reply: cleanText,
      content: cleanText,
      time: timeStr,
      reply_to: supportEmail,
    };

    const candidateServices = Array.from(
      new Set([emailJsServiceId, "default_service", "service_zzl5x89"]),
    );

    let lastEmailJsError = "";
    for (const serviceId of candidateServices) {
      try {
        const emailJsPayload = {
          lib_version: "5.0.3",
          service_id: serviceId,
          template_id: emailJsTemplateId,
          user_id: emailJsPublicKey,
          template_params: templateParams,
        };

        const emailJsRes = await fetch(EMAILJS_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://litera.egor-grebennykov.workers.dev",
            Referer: "https://litera.egor-grebennykov.workers.dev/",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
          body: JSON.stringify(emailJsPayload),
        });

        if (emailJsRes.ok) {
          console.log(
            `[EmailJS Success] Email dispatched directly to ${cleanTo} via EmailJS (${serviceId}).`,
          );
          return {
            success: true,
            provider: "emailjs",
            recipient: cleanTo,
          };
        }
        lastEmailJsError = await emailJsRes.text().catch(() => "");
        console.warn(
          `[EmailJS Server Warning] (${serviceId}) Status ${emailJsRes.status}: ${lastEmailJsError}`,
        );
      } catch (emailJsErr) {
        lastEmailJsError = emailJsErr.message;
        console.warn("[EmailJS Server Error]:", emailJsErr.message);
      }
    }

    if (!process.env.RESEND_API_KEY) {
      throw new Error(
        lastEmailJsError || "Failed to deliver email via EmailJS",
      );
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("Email delivery failed and RESEND_API_KEY is not configured");
  }
  const fromAddress = process.env.RESEND_FROM || DEFAULT_FROM;

  const buildHtml = (targetRecipient, isSandboxNotice = false) => `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${mailSubject}</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); overflow: hidden;">
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 28px 32px; color: #ffffff;">
                  <h1 style="margin: 0 0 6px 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Litera</h1>
                  <p style="margin: 0; font-size: 14px; opacity: 0.9; font-weight: 500;">Книжный интернет-магазин • Служба поддержки читателей</p>
                </td>
              </tr>

              <!-- Body -->
              <tr>
                <td style="padding: 32px;">
                  ${
                    isSandboxNotice
                      ? `<div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 8px; margin-bottom: 24px; font-size: 13px; color: #92400e; line-height: 1.5;">
                          <strong>Тестовый режим Resend:</strong> Письмо адресовано гостю <strong>${targetRecipient}</strong>. Так как в аккаунте Resend ещё не подтверждён собственный домен (resend.com/domains), тестовые письма доставляются на аккаунт разработчика (<strong>${supportEmail}</strong>).
                        </div>`
                      : ""
                  }
                  <p style="font-size: 16px; margin: 0 0 16px 0; color: #334155; line-height: 1.5;">
                    Здравствуйте!
                  </p>
                  <p style="font-size: 15px; margin: 0 0 20px 0; color: #475569; line-height: 1.5;">
                    Администратор <strong>${senderName}</strong> ответил на ваше обращение на сайте Litera:
                  </p>

                  <!-- Message Bubble -->
                  <div style="background-color: #f1f5f9; border-left: 4px solid #6366f1; border-radius: 8px; padding: 18px 20px; margin: 24px 0; font-size: 15px; line-height: 1.6; color: #0f172a; white-space: pre-wrap;">${cleanText}</div>

                  <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin: 24px 0 0 0;">
                    Если у вас остались вопросы, вы можете просто ответить на это письмо (ответ поступит на <strong>${supportEmail}</strong>) или продолжить общение в онлайн-чате на сайте.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 32px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
                  <p style="margin: 0 0 6px 0;">
                    Вы получили это письмо, так как указали свой email в чате с администратором на сайте <a href="https://litera.md" style="color: #6366f1; text-decoration: none; font-weight: 600;">Litera</a>.
                  </p>
                  <p style="margin: 0;">
                    Litera Bookstore © ${new Date().getFullYear()} • Связь с поддержкой: <a href="mailto:${supportEmail}" style="color: #6366f1; text-decoration: none;">${supportEmail}</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const sendPayload = async (toEmail, isFallback = false) => {
    const payload = {
      from: fromAddress,
      to: [toEmail],
      reply_to: supportEmail,
      subject: (isFallback ? `[Тест Resend: для ${cleanTo}] ` : "") + mailSubject,
      text: (isFallback ? `[Тестовый режим Resend: предназначено для ${cleanTo}]\n\n` : "") +
        `Здравствуйте!\n\nАдминистратор ${senderName} ответил на ваше обращение:\n\n${cleanText}\n\nСлужба поддержки Litera\nКонтакты: ${supportEmail}`,
      html: buildHtml(cleanTo, isFallback),
    };

    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: responseData };
  };

  try {
    // 1. Primary attempt to send to guest's specified email
    const primary = await sendPayload(cleanTo, false);

    if (primary.ok) {
      console.log(
        `[Resend Success] Email dispatched to ${cleanTo} via Resend. Message ID: ${primary.data?.id}`
      );
      return {
        success: true,
        id: primary.data?.id,
        provider: "resend",
        recipient: cleanTo,
      };
    }

    // 2. Check if failure is due to unverified custom domain in Resend sandbox
    const errMessage = primary.data?.message || "";
    const isSandboxRestriction =
      primary.status === 403 &&
      (errMessage.includes("testing emails") || errMessage.includes("own email address"));

    if (isSandboxRestriction && supportEmail && cleanTo !== supportEmail) {
      console.warn(
        `[Resend Sandbox] Custom domain not verified. Sending test copy to account owner ${supportEmail}...`
      );
      const fallback = await sendPayload(supportEmail, true);
      if (fallback.ok) {
        console.log(
          `[Resend Fallback Success] Email dispatched to developer email ${supportEmail}. Message ID: ${fallback.data?.id}`
        );
        return {
          success: true,
          id: fallback.data?.id,
          provider: "resend",
          recipient: cleanTo,
          deliveredTo: supportEmail,
          warning: "Resend sandbox mode: delivered to developer email (litera.eu@gmail.com). Add custom domain at resend.com/domains to send to external guests.",
        };
      }
    }

    // If still failed, log and throw
    console.error("[Resend API Error]", primary.status, primary.data);
    throw new Error(
      primary.data?.message || `Resend dispatch failed with status ${primary.status}`
    );
  } catch (err) {
    console.error("[EmailService Error] Failed to send email via Resend:", err.message);
    throw err;
  }
}
