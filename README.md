# Glitz & Glam by Doesitbest

Static HTML, CSS and JavaScript site. Serve it over HTTPS (or localhost while developing); ES modules and Supabase do not work reliably from a `file://` URL.

## Supabase setup

1. Open a Supabase project's SQL Editor and run [`supabase/setup.sql`](supabase/setup.sql). The script creates the site's tables, row-level security policies, anonymous analytics functions, schedule controls and private review-photo bucket. It also migrates the former `owner` and `developer` role names to `store_admin` and `technical_admin`.
2. In Authentication > URL Configuration, set the production Site URL and add the deployed `account.html` and `admin.html` URLs to the allowed redirect URLs. Add the matching local development URLs while testing. Enable customer sign-ups and email confirmation. The account page handles customer registration, sign-in, and password recovery; the admin page uses the same Supabase Auth project but only admits users with an assigned admin role.
3. Invite the two admins in Authentication > Users. Copy each Auth user's UUID, then assign roles in the SQL Editor:

   ```sql
   insert into public.admin_roles (user_id, role) values
     ('STORE_ADMIN_AUTH_USER_UUID', 'store_admin'),
     ('TECHNICAL_ADMIN_AUTH_USER_UUID', 'technical_admin')
   on conflict (user_id) do update set role = excluded.role;
   ```

   The store admin manages catalogue items, customer requests and contact details, reviews and booked periods. The technical admin has technical oversight and aggregate analytics only; customer records and private review contact details are not available to that role. Admin sign-up is not available on the site. Use strong, unique passwords and enable MFA where available.
4. In Project Settings > API, set the Project URL and publishable (or legacy `anon`) key in `js/supabase-config.js`. The URL is already set for the current project; replace the placeholder key. This one public client key is used by Auth, database queries, storage, and RPC calls; no separate key is needed for account creation, sign-in, or password recovery. A publishable/anon key is intended to be visible in browser code and is not a secret. **Never** add a service-role or secret key to the website or commit one to source control.
5. Deploy over HTTPS. Supabase Auth and database/storage policies—not obscurity of the admin URL—enforce access. Configure your Supabase Auth email templates and production redirect URLs before launch.

The SQL script is intended to be safe to run again for this site's schema. If an existing project has custom policies or data, review the SQL changes before applying them.

## Site behavior

- Customers browse the catalogue, see an estimate, and can send a request after signing in. The website does not take payments; the studio confirms availability, final pricing and any payment arrangements directly.
- Store admins can add or replace optional JPEG, PNG or WebP photos (up to 5 MB) on catalogue items. Catalogue photos are publicly viewable; only store admins can upload or delete them. Rerun `supabase/setup.sql` on an existing project to enable catalogue photo storage.
- Running `supabase/setup.sql` adds three unpublished starter catalogue drafts. A store admin can edit their details, price and photo, then publish them from catalogue management. The store-admin dashboard loads catalogue requests and customer phone numbers from Supabase, shows request references and new-request counts, and can refresh the list. WhatsApp appointment enquiries are not stored as catalogue requests.
- The store admin can block a start/end period in the dashboard. The public booking form checks those blocks for the selected date and rejects a requested start time inside a blocked period. Appointment requests made through WhatsApp are not saved as confirmed appointments; an admin must still confirm them.
- Customers must be signed in to submit a review. Reviews remain pending until the store admin approves them. Only approved reviews and photos are public; client WhatsApp numbers are not returned by the public review view. Photo uploads allow JPEG, PNG or WebP, up to three images and 5 MB each.
- Both admin roles read site-wide analytics from Supabase through a role-checked aggregate function. Analytics are stored as daily counters by fixed page and event category—there are no event-level timestamps, account IDs or customer contact fields. Page dwell time is recorded when a page is left; catalogue cards visible for at least one second contribute per-item view and dwell-time totals. These are aggregate impressions, not unique visitors. “Uncleared cart exits” counts account-page exits with a saved selection and is an event count, not a count of unique visitors or proof of intent. Booking enquiries count clicks that open WhatsApp, not confirmed bookings. Metrics are estimates and may be incomplete.
- The display theme is shared across the site. Catalogue selections and display preferences remain in the visitor's browser. The privacy notice is in [`privacy.html`](privacy.html); it is an informational summary, not legal advice. Review it with a South African privacy professional and confirm retention, contact and processor details before launch.

## Local development

Open the folder with VS Code Live Server or another local HTTP server. Set the Supabase publishable/anon key before testing sign-in, customer requests, reviews, catalogue management, booking availability or database analytics. No additional key belongs in `.gitignore`; keep actual secrets out of the frontend and source control.
