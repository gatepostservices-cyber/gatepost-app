# Future project: gatepostservices.com apps behind Cloudflare Access (free plan)

Status: parked 10/28/2026. Nothing changed yet.

## Goal
Put the Owners Hub (hub.gatepostservices.com) and the Team app (team.gatepostservices.com) behind a Cloudflare Access login wall. Nothing loads until an approved email proves itself with a one-time code. The normal app sign-in still applies after that. Website and email must keep working exactly as now.

## What is free
- Cloudflare Free plan (DNS, SSL, CDN): $0.
- Cloudflare Zero Trust Free: Access for up to 50 users, one-time email PIN login: $0.
- Hosting: keep GitHub Pages ($0), or move to Cloudflare Pages ($0).
- No paid plan needed. Partial (CNAME-only) setup needs Business, so the full name-server move is required.

## Current setup (checked 10/28/2026)
- Name servers: ns1/ns2.hosting.businessidentity.llc
- Root A record: 216.150.1.1 (website)
- Email: MX 10 mailserver.businessidentity.llc
- SPF: v=spf1 a mx include:spf.postal.businessidentity.llc ~all
- Re-export the full record list before starting (DKIM, DMARC, www, any verification TXT).

## Steps
1. Export every DNS record from the Business Identity dashboard and save a copy. (Christian or me in the box browser.)
2. Create a free Cloudflare account and add gatepostservices.com on the Free plan. Cloudflare scans the records; compare against the export line by line. MX and mail records set to "DNS only" (grey cloud).
3. Add hub and team CNAME records to gatepostservices-cyber.github.io (or the Cloudflare Pages project).
4. Change the name servers at the registrar to the two Cloudflare ones. Wait for it to take effect (minutes to 24 h).
5. Verify: website loads, email sends and receives (test both ways), SSL is valid.
6. GitHub Pages: set custom domains, or move each app to Cloudflare Pages. Note that one GitHub Pages site gets one custom domain; two apps means two repos (we have that).
7. Update Supabase Auth Site URL and Redirect URLs to the new addresses, and update the apps' manifest and any hard-coded links.
8. Zero Trust: create a team name, then add Access applications for hub.* and team.*. Policy: allow listed emails only (Christian, Nate, the crew). Login method: one-time PIN. Session length: 30 days so workers aren't asked daily.
9. Test on a phone: blocked email is refused, allowed email gets in, the installed home-screen app still opens, GPS and offline still work.
10. Retire the old github.io links once the new ones work (or redirect them).

## Risks and how to avoid them
- Email outage from a missed record: export first, compare, test before and after.
- Installed phone apps keep the old address: everyone re-adds the app from the new link once.
- Access session expiring mid-route: use a long session length.
- Adding a new worker means adding their email in Zero Trust too.

## Rough size
About one working session plus a short wait for the name-server change. Christian may need to approve the registrar change if it needs his login.
