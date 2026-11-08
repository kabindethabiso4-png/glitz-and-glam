# Glitz & Glam by Doesitbest

Static HTML, CSS and JavaScript site. Serve it over HTTPS (or localhost while developing); ES modules and Supabase do not work reliably from a `file://` URL.

## Supabase setup

1. Create a Supabase project and open its SQL Editor. Run [`supabase/setup.sql`](supabase/setup.sql) in a new project dedicated to this site.
2. Enable customer sign-ups in Authentication settings so customers can create accounts at `account.html`. Keep owner and developer access restricted: there is no public admin sign-up form, and customer accounts do not receive an `admin_roles` entry. Enable email confirmation and configure the deployed site's `account.html` URL as an allowed redirect URL.
3. In Authentication > Users, copy each invited user's UUID. In the SQL Editor, assign the roles:

   ```sql
   insert into public.admin_roles (user_id, role) values
     ('OWNER_AUTH_USER_UUID', 'owner'),
     ('DEVELOPER_AUTH_USER_UUID', 'developer');
   ```

   The owner can manage catalogue items and customer requests, review private contact details, and approve or reject reviews. Developer access is restricted to technical/admin status and does not grant access to reviews, customer requests, or client contact details. Use unique strong passwords and enable MFA for both accounts where available.
4. In Project Settings > API, copy the Project URL and the publishable (or legacy `anon`) key into `js/supabase-config.js`. These are browser-visible credentials; **never** put a service-role or secret key in this site.
5. Deploy the site over HTTPS. The small footer link opens `admin.html`; it is not a security measure. Supabase Auth and the database/storage row-level security policies enforce access.

The owner manages catalogue items in `admin.html`; active items appear in the public catalogue. Customers add items to a selection, sign in or create an account, and submit a request. Requests are estimates, not confirmed bookings or payments. Customers can see only their own request history; the owner can update request statuses.

Client reviews are submitted without client accounts and remain pending until the owner approves them. Only approved reviews and their photos are public; client WhatsApp numbers are not returned by the public review view. Photo uploads are limited to JPEG, PNG or WebP, up to three images and 5 MB per image. The private storage bucket exposes approved images through time-limited URLs.

Helpful/not-helpful voting uses a browser-stored random voter ID so a visitor can change their vote. As with any unauthenticated public vote, this is a basic duplicate-vote deterrent, not protection against deliberate vote manipulation; stronger abuse prevention would need a server-side rate limit and/or CAPTCHA.

## Local development

Open the folder with VS Code Live Server or another local HTTP server. Set the Supabase project URL and publishable/anon key before testing sign-in, customer requests, reviews, or catalogue management.

The theme preference and unsubmitted catalogue selection are stored in the visitor's browser. The analytics dashboard also uses browser-local storage, so its visit and lead counts reflect only the browser used to view the dashboard, not site-wide traffic.
