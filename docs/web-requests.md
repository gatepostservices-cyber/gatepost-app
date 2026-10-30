# Website quote requests: how to send them to the Gatepost app

For Wendy. This is what the quote / bid form on gatepostservices.com should do when someone presses **Send**.
The request lands in the Gatepost app (Admin Hub > Inbox > Web) and Christian sees it there. **Keep FormSubmit as the backup: submit to both.**

## How it works (read this first)

* The site calls ONE Supabase function (an RPC): `submit_web_request`. It is the only way in.
* There is **no direct table insert** from the website. The `web_requests` table is closed to the public: no select, insert, update or delete for anyone who is not signed in as an admin. Do not try `/rest/v1/web_requests`; it will be refused.
* The function checks everything on the server (lengths, phone / email format, honeypot, rate limit), removes any HTML from the text, and answers with only `{"ok":true}` or `{"ok":false,"error":"<code>"}`.
* The key below is the app's **public** (publishable) key. It is safe to put in the page. It can only call public functions like this one.
* Allowed origin: call it from the live site (https://gatepostservices.com). A browser POST to a Supabase RPC needs no extra CORS setup. The function does not block other origins; the honeypot, validation and rate limit are the protection.

## Endpoint

```
POST https://hssevqgkoeuludwoxyuo.supabase.co/rest/v1/rpc/submit_web_request
apikey: sb_publishable_o5m22_S-wb3D77hqSL5-ew_fLw8b66Y
Content-Type: application/json
```

Send **only** the `apikey` header (plus Content-Type). Do not add an `Authorization: Bearer` header with this key.

## Fields (JSON body)

| Field | Required | Max | Notes |
|---|---|---|---|
| `p_name` | **yes** | 100 | Customer name |
| `p_phone` | one of phone / email | 40 | 7 to 15 digits; spaces, dashes, parentheses OK |
| `p_email` | one of phone / email | 160 | Must look like an email |
| `p_address` | no | 200 | The form's "address / area" box goes here |
| `p_zip` | no | 10 | 5 digits (or ZIP+4) |
| `p_service` | no | 100 | e.g. "Fence", "Gate", "Deck" |
| `p_details` | no | 3000 | Free text |
| `p_design` | no | 200 | The design name from `/bid?design=...` (read it from the URL and send it as-is) |
| `p_photos` | no | 10 URLs | JSON array of `https://` links. URLs only for now; there is no photo upload |
| `p_source_page` | no | 200 | Send `location.pathname + location.search` so we know which page it came from |
| `p_website` | **must be empty** | | The honeypot. Hidden input that real people never fill in |

Leave out any optional field you do not have (or send `null`). Names must be exactly as above, including the `p_` prefix.

## Honeypot

Add a hidden text input named `website` to the form, hidden with CSS (`position:absolute; left:-9999px`, plus `tabindex="-1" autocomplete="off"`), not `type="hidden"`. Send its value as `p_website`. If it is not empty the function answers `{"ok":true}` but stores nothing, so the bot thinks it worked. Real visitors leave it empty.

## Copy-paste snippet (submit to the app AND to FormSubmit)

```html
<form id="quote-form">
  <input name="name" required placeholder="Your name">
  <input name="phone" type="tel" placeholder="Phone">
  <input name="email" type="email" placeholder="Email">
  <input name="address" placeholder="Address or area">
  <input name="zip" inputmode="numeric" placeholder="ZIP (optional)">
  <select name="service">...</select>
  <textarea name="details"></textarea>
  <!-- honeypot: real people never see or fill this -->
  <input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button type="submit">Send</button>
  <p id="quote-msg" role="status"></p>
</form>

<script>
const GP_URL = 'https://hssevqgkoeuludwoxyuo.supabase.co/rest/v1/rpc/submit_web_request';
const GP_KEY = 'sb_publishable_o5m22_S-wb3D77hqSL5-ew_fLw8b66Y';
const FORMSUBMIT_URL = 'YOUR EXISTING FormSubmit URL'; // keep exactly what the form uses today (backup)
const PHONE_TEXT = '(505) 750-3019';

document.getElementById('quote-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = ev.target, msg = document.getElementById('quote-msg'), btn = f.querySelector('button[type=submit]');
  const v = n => (f.elements[n] ? f.elements[n].value.trim() : '');
  const design = new URLSearchParams(location.search).get('design') || '';   // /bid?design=...
  btn.disabled = true; msg.textContent = 'Sending\u2026';

  const body = {
    p_name: v('name'), p_phone: v('phone') || null, p_email: v('email') || null,
    p_address: v('address') || null, p_zip: v('zip') || null, p_service: v('service') || null,
    p_details: v('details') || null, p_design: design || null,
    p_source_page: location.pathname + location.search,
    p_website: v('website')                                   // honeypot, must be empty
  };

  // 1) the Gatepost app (fetch never throws on an HTTP error, so check both res.ok and json.ok)
  const toApp = fetch(GP_URL, {
    method: 'POST',
    headers: { 'apikey': GP_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(async (res) => { const j = await res.json().catch(() => ({})); return { ok: res.ok && j.ok === true, error: j.error || 'network' }; })
    .catch(() => ({ ok: false, error: 'network' }));

  // 2) FormSubmit backup: send the same form exactly as you do today
  const toBackup = fetch(FORMSUBMIT_URL, { method: 'POST', body: new FormData(f), headers: { 'Accept': 'application/json' } })
    .then(res => ({ ok: res.ok })).catch(() => ({ ok: false }));

  const [app, backup] = await Promise.all([toApp, toBackup]);
  btn.disabled = false;

  if (app.ok || backup.ok) {            // success if EITHER one went through
    f.reset();
    msg.textContent = 'Thank you! We got your request and will contact you soon. Questions? Call or text ' + PHONE_TEXT + '.';
    return;
  }
  const friendly = {
    name_required: 'Please enter your name.',
    contact_required: 'Please enter a phone number or an email so we can reach you.',
    phone_invalid: 'That phone number does not look right.',
    email_invalid: 'That email address does not look right.',
    zip_invalid: 'Please enter a 5-digit ZIP code, or leave it blank.',
    too_long: 'One of the boxes has too much text. Please shorten it.',
    photos_invalid: 'One of the photo links does not look right.',
    rate_limited: 'We already have several requests from you. We will be in touch, or call ' + PHONE_TEXT + '.'
  };
  msg.textContent = friendly[app.error] || ('We could not send that. Please call or text ' + PHONE_TEXT + '.');
});
</script>
```

## Error codes (`{"ok":false,"error":"..."}`)

| error | Meaning | What to show |
|---|---|---|
| `name_required` | Name empty | Ask for the name |
| `contact_required` | No phone and no email | Ask for either |
| `phone_invalid` / `email_invalid` / `zip_invalid` | Bad format | Ask to fix that box |
| `too_long` | A box is over its max | Ask to shorten |
| `photos_invalid` | Not a list of http(s) links (max 10) | Fix or drop the photos |
| `rate_limited` | More than 5 requests from the same phone or email in the last hour | Tell them we have it, give the phone number |
| `server` | Unexpected problem on our side | Show the call-us text; FormSubmit still carries the request |
| network / no answer | Offline, blocked | Same as above |

HTTP is 200 for both ok and error answers from this function. A 401/404 means the key or URL is wrong.

## Thank-you text

Use exactly: **"Thank you! We got your request and will contact you soon. Questions? Call or text (505) 750-3019."** Use only that phone number on the site and in the message.

## Quick test

```bash
curl -s https://hssevqgkoeuludwoxyuo.supabase.co/rest/v1/rpc/submit_web_request \
  -H "apikey: sb_publishable_o5m22_S-wb3D77hqSL5-ew_fLw8b66Y" -H "Content-Type: application/json" \
  -d '{"p_name":"Test Person","p_phone":"5055550100","p_service":"Fence","p_details":"test, please ignore"}'
# -> {"ok":true}
```

(That makes a real row in the app. Set it to Lost and note "test" afterwards. Sending nothing for the name returns `{"ok":false,"error":"name_required"}`.)

## Not available yet

Photo upload (only links), spam captcha, and email notifications to the team. A request shows up in the app under Admin Hub > Inbox > Web (open the app and tap Refresh).
