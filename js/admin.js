import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_CONFIGURED, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { startAnalyticsPageTracking } from './analytics.js';

const IMAGE_BUCKET = 'review-images';
const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

startAnalyticsPageTracking();
const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const loginForm = document.getElementById('loginForm');
const adminResetForm = document.getElementById('adminResetForm');
const loginMessage = document.getElementById('loginMessage');
const dashboardMessage = document.getElementById('dashboardMessage');
const moderationPanel = document.getElementById('moderationPanel');
const technicalNotice = document.getElementById('technicalNotice');
const catalogueManagement = document.getElementById('catalogueManagement');
const requestManagement = document.getElementById('requestManagement');
const scheduleManagement = document.getElementById('scheduleManagement');
document.getElementById('year').textContent = new Date().getFullYear();

function renderTrafficChart(daily) {
  const chart = document.getElementById('trafficChart');
  chart.replaceChildren();
  const recent = daily.slice(-7);
  const maximum = Math.max(...recent.map(day => day.visits), 1);
  if (!recent.length) {
    chart.textContent = 'No visit data yet.';
    return;
  }
  recent.forEach(day => {
    const bar = document.createElement('div');
    bar.className = 'traffic-bar';
    bar.style.height = `${Math.max(18, (day.visits / maximum) * 100)}%`;
    bar.setAttribute('data-label', new Date(`${day.day}T12:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }));
    bar.title = `${day.visits} visits · ${day.booking_requests} booking requests · ${day.unfinished_selections} uncleared carts`;
    chart.append(bar);
  });
}

function renderMetricList(targetId, rows, labelKey, countKey, countLabel) {
  const list = document.getElementById(targetId);
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No data yet.';
    list.append(empty);
    return;
  }
  rows.forEach(row => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = row[labelKey];
    const count = document.createElement('span');
    count.textContent = `${row[countKey]} ${countLabel}`;
    item.append(label, count);
    list.append(item);
  });
}

function renderPageBreakdown(rows) {
  const list = document.getElementById('pageBreakdown');
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No data yet.';
    list.append(empty);
    return;
  }
  rows.forEach(row => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = row.page;
    const total = document.createElement('span');
    total.textContent = `${row.visits} visits · avg ${formatDuration(row.average_seconds)}`;
    item.append(label, total);
    list.append(item);
  });
}

function renderCatalogueBreakdown(rows) {
  const list = document.getElementById('catalogueItemBreakdown');
  list.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.textContent = 'No engaged catalogue views yet.';
    list.append(empty);
    return;
  }
  rows.forEach(row => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = row.name;
    const total = document.createElement('span');
    total.textContent = `${row.views} views · avg ${formatDuration(row.average_seconds)}`;
    item.append(label, total);
    list.append(item);
  });
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

async function renderAnalyticsDashboard() {
  const notice = document.getElementById('analyticsNotice');
  notice.textContent = 'Loading aggregate analytics...';
  document.querySelectorAll('.metric-card strong').forEach(metric => {
    metric.textContent = '—';
  });
  const { data, error } = await supabase.rpc('get_admin_analytics');
  if (error || !data) {
    notice.textContent = 'Analytics could not be loaded. Please try again later.';
    if (error) console.error('Unable to load aggregate admin analytics:', error);
    return;
  }
  const totals = data.totals;
  document.getElementById('dashboardVisits').textContent = String(totals.pageViews);
  document.getElementById('dashboardAvgDuration').textContent = formatDuration(totals.averageVisitSeconds);
  document.getElementById('dashboardUnclearedCarts').textContent = String(totals.unfinishedSelections);
  document.getElementById('dashboardBookings').textContent = String(totals.bookingRequests);
  document.getElementById('dashboardServiceRequests').textContent = String(totals.serviceRequests);
  document.getElementById('dashboardOpenRequests').textContent = String(totals.openRequests);
  document.getElementById('dashboardReviews').textContent = String(totals.reviewSubmissions);
  renderTrafficChart(data.daily);
  renderPageBreakdown(data.topPages);
  renderCatalogueBreakdown(data.catalogueItems);
  renderMetricList('serviceBreakdown', data.topServices, 'service', 'requests', 'requests');
  renderMetricList('requestStatusBreakdown', data.requestStatuses, 'status', 'requests', 'requests');
  notice.textContent = 'Anonymous aggregate data only. Visit and cart metrics are estimates; no customer contact details are included.';
}

function showLogin(message = '') {
  loginPanel.hidden = false;
  dashboardPanel.hidden = true;
  loginForm.hidden = false;
  adminResetForm.hidden = true;
  document.getElementById('adminNewPasswordForm').hidden = true;
  document.getElementById('showAdminReset').hidden = false;
  document.getElementById('cancelAdminReset').hidden = true;
  loginMessage.textContent = message;
}

function showAccessError(message) {
  showLogin(message);
}

async function loadAdmin(user) {
  const { data: roleRecord, error } = await supabase
    .from('admin_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    showAccessError('Admin access could not be verified. Please try again later.');
    console.error('Unable to verify admin role:', error);
    return;
  }
  if (!roleRecord || !['store_admin', 'technical_admin'].includes(roleRecord.role)) {
    await supabase.auth.signOut();
    showAccessError('This account does not have a valid admin role. Ask the site owner to assign store_admin or technical_admin in public.admin_roles.');
    return;
  }

  loginPanel.hidden = true;
  dashboardPanel.hidden = false;
  document.getElementById('adminRole').textContent =
    roleRecord.role === 'store_admin' ? 'Store admin' : 'Technical admin';
  moderationPanel.hidden = roleRecord.role !== 'store_admin';
  technicalNotice.hidden = roleRecord.role !== 'technical_admin';
  catalogueManagement.hidden = roleRecord.role !== 'store_admin';
  requestManagement.hidden = roleRecord.role !== 'store_admin';
  scheduleManagement.hidden = roleRecord.role !== 'store_admin';
  const storeTasks = roleRecord.role === 'store_admin'
    ? [showReviews(), showCatalogueItems(), showServiceRequests(), showScheduleBlocks()]
    : [];
  await Promise.all([renderAnalyticsDashboard(), ...storeTasks]);
}

function resetCatalogueForm() {
  document.getElementById('catalogueForm').reset();
  document.getElementById('catalogueItemId').value = '';
  document.getElementById('catalogueOrder').value = '0';
  document.getElementById('catalogueActive').checked = true;
  document.getElementById('saveCatalogueItem').textContent = 'Add catalogue item';
  document.getElementById('cancelCatalogueEdit').hidden = true;
}

function editCatalogueItem(item) {
  document.getElementById('catalogueItemId').value = item.id;
  document.getElementById('catalogueName').value = item.name;
  document.getElementById('catalogueCategory').value = item.category;
  document.getElementById('cataloguePrice').value = String(item.price);
  document.getElementById('catalogueDescription').value = item.description;
  document.getElementById('catalogueOrder').value = String(item.sort_order);
  document.getElementById('catalogueActive').checked = item.is_active;
  document.getElementById('saveCatalogueItem').textContent = 'Save changes';
  document.getElementById('cancelCatalogueEdit').hidden = false;
  document.getElementById('catalogueForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function showCatalogueItems() {
  const target = document.getElementById('catalogueAdminList');
  const { data: items, error } = await supabase
    .from('catalogue_items')
    .select('id, name, category, description, price, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) {
    target.textContent = 'Catalogue items could not be loaded.';
    console.error('Unable to load admin catalogue:', error);
    return;
  }
  target.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Add an item to make it available in the public catalogue.';
    target.append(empty);
    return;
  }

  items.forEach(item => {
    const row = document.createElement('article');
    row.className = 'admin-list-item';
    const details = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = item.name;
    const metadata = document.createElement('p');
    metadata.className = 'item-meta';
    metadata.textContent = `${item.category} · R${Number(item.price).toFixed(2)} · ${item.is_active ? 'Visible' : 'Hidden'}`;
    const description = document.createElement('p');
    description.textContent = item.description || 'No description';
    details.append(heading, metadata, description);
    const actions = document.createElement('div');
    actions.className = 'review-admin-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'btn btn-secondary';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editCatalogueItem(item));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-danger';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => deleteCatalogueItem(item));
    actions.append(edit, remove);
    row.append(details, actions);
    target.append(row);
  });
}

async function deleteCatalogueItem(item) {
  if (!window.confirm(`Delete “${item.name}” from the catalogue?`)) return;
  const { error } = await supabase.from('catalogue_items').delete().eq('id', item.id);
  if (error) {
    dashboardMessage.textContent = 'The catalogue item could not be deleted.';
    console.error('Unable to delete catalogue item:', error);
    return;
  }
  dashboardMessage.textContent = 'Catalogue item deleted.';
  await showCatalogueItems();
}

async function showServiceRequests() {
  const target = document.getElementById('adminRequests');
  const { data: requests, error } = await supabase
    .from('service_requests')
    .select('id, contact_name, phone, items, estimated_total, customization, call_requested, status, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    target.textContent = 'Customer requests could not be loaded.';
    console.error('Unable to load customer requests:', error);
    return;
  }
  target.replaceChildren();
  if (!requests.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Customer catalogue requests will appear here.';
    target.append(empty);
    return;
  }

  requests.forEach(request => {
    const row = document.createElement('article');
    row.className = 'admin-list-item admin-request-item';
    const details = document.createElement('div');
    details.className = 'review-admin-details';
    const heading = document.createElement('h3');
    heading.textContent = request.contact_name;
    const metadata = document.createElement('p');
    metadata.className = 'item-meta';
    metadata.textContent = `${request.phone} · ${new Date(request.created_at).toLocaleString()}${request.call_requested ? ' · Requested a call' : ''}`;
    const items = document.createElement('p');
    items.textContent = request.items.map(item => `${item.name} × ${item.quantity}`).join(' · ');
    const total = document.createElement('p');
    total.textContent = `Estimated total: R${Number(request.estimated_total).toFixed(2)}`;
    details.append(heading, metadata, items, total);
    if (request.customization) {
      const note = document.createElement('p');
      note.textContent = `Note: ${request.customization}`;
      details.append(note);
    }

    const actions = document.createElement('div');
    actions.className = 'admin-request-actions';
    const status = document.createElement('select');
    status.setAttribute('aria-label', `Request status for ${request.contact_name}`);
    ['new', 'contacted', 'confirmed', 'completed', 'cancelled'].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value[0].toUpperCase() + value.slice(1);
      option.selected = value === request.status;
      status.append(option);
    });
    status.addEventListener('change', () => updateRequestStatus(request.id, status.value));
    actions.append(status);
    row.append(details, actions);
    target.append(row);
  });
}

async function updateRequestStatus(id, status) {
  dashboardMessage.textContent = 'Saving request status...';
  const { error } = await supabase.from('service_requests').update({ status }).eq('id', id);
  if (error) {
    dashboardMessage.textContent = 'The request status could not be updated.';
    console.error('Unable to update request status:', error);
    await showServiceRequests();
    return;
  }
  dashboardMessage.textContent = 'Request status updated.';
}

async function showScheduleBlocks() {
  const target = document.getElementById('scheduleBlocks');
  const { data: blocks, error } = await supabase
    .from('appointment_blocks')
    .select('id, starts_at, ends_at')
    .order('starts_at', { ascending: true });
  if (error) {
    target.textContent = 'Booked periods could not be loaded.';
    console.error('Unable to load appointment blocks:', error);
    return;
  }
  target.replaceChildren();
  if (!blocks.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No periods are currently blocked.';
    target.append(empty);
    return;
  }

  blocks.forEach(block => {
    const row = document.createElement('article');
    row.className = 'admin-list-item';
    const details = document.createElement('div');
    const heading = document.createElement('h3');
    heading.textContent = new Date(block.starts_at).toLocaleString('en-ZA');
    const ends = document.createElement('p');
    ends.textContent = `Until ${new Date(block.ends_at).toLocaleString('en-ZA')}`;
    details.append(heading, ends);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-danger';
    remove.textContent = 'Remove block';
    remove.addEventListener('click', () => removeScheduleBlock(block.id));
    row.append(details, remove);
    target.append(row);
  });
}

async function removeScheduleBlock(id) {
  const { error } = await supabase.from('appointment_blocks').delete().eq('id', id);
  if (error) {
    dashboardMessage.textContent = 'The booked period could not be removed.';
    console.error('Unable to remove appointment block:', error);
    return;
  }
  dashboardMessage.textContent = 'Booked period removed from the schedule.';
  await showScheduleBlocks();
}

document.getElementById('scheduleForm').addEventListener('submit', async event => {
  event.preventDefault();
  const startsAt = new Date(document.getElementById('blockStart').value);
  const endsAt = new Date(document.getElementById('blockEnd').value);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    dashboardMessage.textContent = 'Choose a valid period with an end time after its start time.';
    return;
  }

  const { error } = await supabase.from('appointment_blocks').insert({
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString()
  });
  if (error) {
    dashboardMessage.textContent = 'The period could not be blocked.';
    console.error('Unable to block appointment period:', error);
    return;
  }
  document.getElementById('scheduleForm').reset();
  dashboardMessage.textContent = 'Period blocked. The public availability check will now exclude it.';
  await showScheduleBlocks();
});

document.getElementById('catalogueForm').addEventListener('submit', async event => {
  event.preventDefault();
  const id = document.getElementById('catalogueItemId').value;
  const item = {
    name: document.getElementById('catalogueName').value.trim(),
    category: document.getElementById('catalogueCategory').value.trim(),
    description: document.getElementById('catalogueDescription').value.trim(),
    price: Number(document.getElementById('cataloguePrice').value),
    sort_order: Number(document.getElementById('catalogueOrder').value),
    is_active: document.getElementById('catalogueActive').checked
  };
  const { error } = id
    ? await supabase.from('catalogue_items').update(item).eq('id', id)
    : await supabase.from('catalogue_items').insert(item);
  if (error) {
    dashboardMessage.textContent = 'The catalogue item could not be saved.';
    console.error('Unable to save catalogue item:', error);
    return;
  }
  dashboardMessage.textContent = id ? 'Catalogue item updated.' : 'Catalogue item added.';
  resetCatalogueForm();
  await showCatalogueItems();
});

document.getElementById('cancelCatalogueEdit').addEventListener('click', resetCatalogueForm);

function makeStatusButton(label, review, status, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn ${className}`.trim();
  button.textContent = label;
  button.addEventListener('click', () => updateReview(review.id, status));
  return button;
}

async function showReviews() {
  const target = document.getElementById('adminReviews');
  const rating = document.getElementById('adminRating');
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('id, first_name, last_name, whatsapp, service, rating, body, photos, status, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    target.textContent = 'Reviews could not be loaded. Please try again.';
    rating.textContent = 'Rating unavailable';
    console.error('Unable to load admin reviews:', error);
    return;
  }

  const approved = reviews.filter(review => review.status === 'approved');
  const average = approved.length
    ? approved.reduce((sum, review) => sum + Number(review.rating), 0) / approved.length
    : null;
  rating.textContent = average === null
    ? `${reviews.length} submitted ${reviews.length === 1 ? 'review' : 'reviews'}`
    : `Public rating: ${average.toFixed(1)} / 5 · ${approved.length} approved`;
  target.replaceChildren();
  if (!reviews.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Client reviews will appear here when submitted.';
    target.append(empty);
    return;
  }

  for (const review of reviews) {
    const item = document.createElement('article');
    item.className = 'admin-list-item review-admin-item';
    const details = document.createElement('div');
    details.className = 'review-admin-details';
    const heading = document.createElement('h3');
    heading.textContent = `${review.first_name} ${review.last_name} · ${'★'.repeat(Number(review.rating))}${'☆'.repeat(5 - Number(review.rating))}`;
    const metadata = document.createElement('p');
    metadata.className = 'item-meta';
    metadata.textContent = `${review.service} · ${review.status} · ${new Date(review.created_at).toLocaleDateString()}`;
    const contact = document.createElement('p');
    contact.textContent = `WhatsApp: ${review.whatsapp}`;
    const text = document.createElement('p');
    text.textContent = review.body;
    details.append(heading, metadata, contact, text);

    if (review.photos.length) {
      const gallery = document.createElement('div');
      gallery.className = 'review-photos admin-review-photos';
      for (const path of review.photos) {
        const { data, error: imageError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .createSignedUrl(path, 3600);
        if (imageError) {
          console.error('Unable to load admin review image:', imageError);
          continue;
        }
        const image = document.createElement('img');
        image.src = data.signedUrl;
        image.alt = `Photo attached by ${review.first_name} ${review.last_name}`;
        image.loading = 'lazy';
        gallery.append(image);
      }
      if (gallery.childElementCount) details.append(gallery);
    }

    const actions = document.createElement('div');
    actions.className = 'review-admin-actions';
    if (review.status !== 'approved') {
      actions.append(makeStatusButton('Approve', review, 'approved'));
    }
    if (review.status !== 'rejected') {
      actions.append(makeStatusButton('Reject', review, 'rejected', 'btn-secondary'));
    }
    item.append(details, actions);
    target.append(item);
  }
}

async function updateReview(id, status) {
  dashboardMessage.textContent = 'Saving review status...';
  const { error } = await supabase.from('reviews').update({ status }).eq('id', id);
  if (error) {
    dashboardMessage.textContent = 'The review status could not be updated.';
    console.error('Unable to update review status:', error);
    return;
  }
  dashboardMessage.textContent = 'Review status updated.';
  await showReviews();
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) {
    loginMessage.textContent = 'Supabase is not configured. Follow the setup steps in README.md.';
    return;
  }
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  loginMessage.textContent = 'Signing in...';
  const { data, error } = await supabase.auth.signInWithPassword({
    email: document.getElementById('adminEmail').value.trim(),
    password: document.getElementById('adminPassword').value
  });
  button.disabled = false;
  if (error) {
    loginMessage.textContent = `Sign-in failed: ${error.message}`;
    console.error('Admin sign-in failed:', error);
    return;
  }
  await loadAdmin(data.user);
});

document.getElementById('showAdminReset').addEventListener('click', () => {
  loginForm.hidden = true;
  adminResetForm.hidden = false;
  document.getElementById('showAdminReset').hidden = true;
  document.getElementById('cancelAdminReset').hidden = false;
  loginMessage.textContent = '';
});

document.getElementById('cancelAdminReset').addEventListener('click', () => showLogin());

adminResetForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) {
    loginMessage.textContent = 'Password recovery is not configured. Contact the site owner.';
    return;
  }
  const button = adminResetForm.querySelector('button[type="submit"]');
  button.disabled = true;
  const email = document.getElementById('adminResetEmail').value.trim();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('admin.html', window.location.href).href
  });
  button.disabled = false;
  if (error) {
    loginMessage.textContent = 'A reset link could not be sent. Please try again later.';
    console.error('Admin password reset request failed:', error);
    return;
  }
  loginMessage.textContent = 'If an authorized account exists for that email, a reset link will arrive shortly.';
  adminResetForm.reset();
});

document.getElementById('adminNewPasswordForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = document.getElementById('adminNewPassword').value;
  if (password !== document.getElementById('adminConfirmPassword').value) {
    loginMessage.textContent = 'The passwords do not match.';
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  loginMessage.textContent = 'Updating your password...';
  const { data, error } = await supabase.auth.updateUser({ password });
  button.disabled = false;
  if (error) {
    loginMessage.textContent = 'Your password could not be updated. Please request a new reset link.';
    console.error('Unable to update admin password:', error);
    return;
  }
  form.reset();
  form.hidden = true;
  loginMessage.textContent = 'Password updated. Checking your admin access...';
  if (data.user) await loadAdmin(data.user);
});

document.getElementById('signOutButton').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    dashboardMessage.textContent = 'Could not sign out. Please try again.';
    console.error('Admin sign-out failed:', error);
    return;
  }
  showLogin('You have been signed out.');
});

if (!supabase) {
  showLogin('Supabase is not configured. Follow the setup steps in README.md.');
} else {
  let recoveringPassword = false;
  supabase.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
      recoveringPassword = true;
      loginPanel.hidden = false;
      dashboardPanel.hidden = true;
      loginForm.hidden = true;
      adminResetForm.hidden = true;
      document.getElementById('adminNewPasswordForm').hidden = false;
      document.getElementById('showAdminReset').hidden = true;
      document.getElementById('cancelAdminReset').hidden = true;
      loginMessage.textContent = 'Choose a new password for your admin account.';
    }
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      showLogin('Your sign-in session could not be checked. Please sign in again.');
      console.error('Unable to check admin session:', error);
      return;
    }
    if (recoveringPassword) return;
    if (data.session) loadAdmin(data.session.user);
    else showLogin();
  });
}

document.getElementById('year').textContent = new Date().getFullYear();
