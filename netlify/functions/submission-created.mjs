export default async (req) => {
  const NOTIFICATION_EMAIL = 'justin@yeaman.uk';
  const RESEND_API_KEY = Netlify.env.get('RESEND_API_KEY');

  let payload;
  try {
    const body = await req.json();
    payload = body.payload;
  } catch (err) {
    console.error('Failed to parse submission payload:', err.message);
    return new Response('Bad request', { status: 400 });
  }

  const formName = payload?.form_name || 'Unknown form';
  const data = payload?.data || {};
  const submittedAt = payload?.created_at || new Date().toISOString();

  // Build a readable summary of the submission fields
  const fieldSummary = Object.entries(data)
    .filter(([key]) => !key.startsWith('_') && key !== 'bot-field' && key !== 'form-name')
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  const subject = `New ${formName} submission on Yea I Consulting`;
  const textBody = [
    `A new submission was received from the "${formName}" form.`,
    '',
    `Submitted at: ${submittedAt}`,
    '',
    '--- Submission Details ---',
    fieldSummary,
    '',
    'View all submissions in your Netlify dashboard:',
    'https://app.netlify.com/projects/yea-i-consulting/forms',
  ].join('\n');

  const htmlBody = [
    `<h2>New ${formName} submission</h2>`,
    `<p>A new submission was received on <strong>Yea I Consulting</strong>.</p>`,
    `<p><strong>Submitted at:</strong> ${submittedAt}</p>`,
    '<h3>Submission Details</h3>',
    '<table style="border-collapse:collapse;font-family:sans-serif;">',
    ...Object.entries(data)
      .filter(([key]) => !key.startsWith('_') && key !== 'bot-field' && key !== 'form-name')
      .map(
        ([key, value]) =>
          `<tr><td style="padding:6px 12px;border:1px solid #ddd;font-weight:bold;text-transform:capitalize;">${key}</td><td style="padding:6px 12px;border:1px solid #ddd;">${value}</td></tr>`,
      ),
    '</table>',
    '<br>',
    '<p><a href="https://app.netlify.com/projects/yea-i-consulting/forms">View all submissions in Netlify</a></p>',
  ].join('\n');

  if (!RESEND_API_KEY) {
    console.warn(
      'RESEND_API_KEY is not set. Email notification to',
      NOTIFICATION_EMAIL,
      'was not sent. Set the RESEND_API_KEY environment variable to enable email alerts.',
    );
    console.log('Submission received:', { formName, data: fieldSummary });
    return new Response('OK (email skipped — RESEND_API_KEY not configured)');
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Yea I Consulting <notifications@yea-i.com>',
        to: [NOTIFICATION_EMAIL],
        subject,
        html: htmlBody,
        text: textBody,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Resend API error:', res.status, errBody);
      return new Response('Email send failed', { status: 500 });
    }

    console.log('Email notification sent to', NOTIFICATION_EMAIL, 'for', formName, 'submission');
    return new Response('OK');
  } catch (err) {
    console.error('Failed to send email notification:', err.message);
    return new Response('Email send error', { status: 500 });
  }
};
