"""
Email service using Resend API.
Sends branded HTML verification code emails.
"""
from __future__ import annotations
import asyncio
import logging
from typing import Optional

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


def _build_html(code: str) -> str:
    """Build a branded HTML email containing the 6-digit verification code."""
    digits = list(code)
    digit_boxes = "".join(
        f"""
        <div style="
            background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%);
            color: white;
            font-size: 28px;
            font-weight: 800;
            width: 48px;
            height: 56px;
            line-height: 56px;
            text-align: center;
            border-radius: 10px;
            font-family: 'Courier New', Courier, monospace;
            display: inline-block;
            margin: 0 4px;
        ">{d}</div>"""
        for d in digits
    )

    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your LingoGen Verification Code</title>
</head>
<body style="margin:0;padding:0;background:#030712;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030712;min-height:100vh;">
    <tr>
      <td align="center" valign="top" style="padding:48px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0B1329;border:1px solid #1E293B;border-radius:20px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:36px 40px 24px;text-align:center;background:linear-gradient(180deg,#0B1329 0%,#030712 100%);">
              <div style="
                font-size:28px;
                font-weight:800;
                letter-spacing:-0.8px;
                background:linear-gradient(135deg,#3B82F6 0%,#10B981 100%);
                -webkit-background-clip:text;
                -webkit-text-fill-color:transparent;
                background-clip:text;
                display:inline-block;
              ">LingoGen</div>
              <div style="font-size:12px;color:#64748B;margin-top:4px;letter-spacing:0.5px;">Learn &amp; Chat Globally &amp; Anonymously</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px 40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#F8FAFC;letter-spacing:-0.5px;">Verify your email address</h1>
              <p style="margin:0 0 28px;font-size:14px;color:#94A3B8;line-height:1.6;">
                Enter the code below to complete your sign up. The code expires in <strong style="color:#F8FAFC;">10 minutes</strong>.
              </p>

              <!-- Code boxes -->
              <div style="text-align:center;margin:0 0 28px;">
                {digit_boxes}
              </div>

              <!-- Divider -->
              <div style="border-top:1px solid #1E293B;margin:28px 0;"></div>

              <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6;">
                If you didn't request this code, you can safely ignore this email. Someone else may have typed your email by mistake.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;background:#030712;border-top:1px solid #1E293B;text-align:center;">
              <p style="margin:0;font-size:11px;color:#475569;">
                &copy; 2026 LingoGen &nbsp;&middot;&nbsp; Learn &amp; Chat Globally &amp; Anonymously
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


class EmailService:
    """Sends transactional emails via the Resend REST API."""

    async def send_verification_code(self, to_email: str, code: str) -> bool:
        """
        Send a 6-digit verification code email via Resend.
        Returns True on success, False on failure (logs the error).
        """
        settings = get_settings()
        api_key = settings.resend_api_key
        if not api_key:
            logger.warning("RESEND_API_KEY is not set — skipping email send.")
            return False

        html_body = _build_html(code)
        payload = {
            "from": f"{settings.smtp_from_name} <{settings.smtp_from_email}>",
            "to": [to_email],
            "subject": "Your LingoGen Verification Code",
            "html": html_body,
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                if response.status_code in (200, 201):
                    logger.info("Verification code email sent to %s via Resend", to_email)
                    return True
                else:
                    logger.error(
                        "Resend API error: %s — %s", response.status_code, response.text
                    )
                    return False
        except Exception as exc:
            logger.error("Failed to send email to %s: %s", to_email, exc)
            return False


# Module-level singleton
email_service = EmailService()
