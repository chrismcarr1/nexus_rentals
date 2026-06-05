function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
}

function readBearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : "";
}

function isEmailAddress(value) {
  return typeof value === "string" || (Boolean(value) && typeof value.email === "string");
}

function getEmailBinding(env) {
  return env.SEND_EMAIL || env.EMAIL;
}

export default {
  async fetch(request, env) {
    if (request.method === "GET" || request.method === "HEAD") {
      return json({ ok: true, service: "nexus-email-worker" });
    }

    if (request.method !== "POST") {
      return json({ error: "Method not allowed." }, { status: 405 });
    }

    const emailBinding = getEmailBinding(env);
    if (!emailBinding) {
      return json({ error: "Cloudflare email binding is not configured. Add an EMAIL or SEND_EMAIL binding." }, { status: 500 });
    }

    if (!env.NEXUS_EMAIL_SECRET) {
      return json({ error: "NEXUS_EMAIL_SECRET is not configured." }, { status: 500 });
    }

    if (readBearerToken(request) !== env.NEXUS_EMAIL_SECRET) {
      return json({ error: "Unauthorized." }, { status: 401 });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const from = payload.from || env.DEFAULT_FROM_EMAIL;
    const { to, subject, html, text } = payload;

    if (!isEmailAddress(from) || !to || !subject || (!html && !text)) {
      return json({ error: "Missing required email fields." }, { status: 400 });
    }

    try {
      const result = await emailBinding.send({
        from,
        to,
        subject,
        html,
        text
      });

      return json({ sent: true, messageId: result.messageId });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Email delivery failed." }, { status: 502 });
    }
  },

  async email(message, env) {
    if (env.FORWARD_TO_EMAIL) {
      await message.forward(env.FORWARD_TO_EMAIL);
    }
  }
};
