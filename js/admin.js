import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_CONFIGURED, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const IMAGE_BUCKET = 'review-images';
const ANALYTICS_KEY = 'glitzGlam.analytics.v1';
const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const loginPanel = document.getElementById('loginPanel');
const dashboardPanel = document.getElementById('dashboardPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const dashboardMessage = document.getElementById('dashboardMessage');
const moderationPanel = document.getElementById('moderationPanel');
const developerNotice = document.getElementById('developerNotice');
const catalogueManagement = document.getElementById('catalogueManagement');
const requestManagement = document.getElementById('requestManagement');
document.getElementById('year').textContent = new Date().getFullYear();

function readAnalyticsState() {
  try {
    const raw = localStorage.getItem(ANALYTICS_KEY);
    if (!raw) return { visits: [], events: [] };
    const parsed = JSON.parse(raw);
    return {
      visits: Array.isArray(parsed.visits) ? parsed.visits : [],
      events: Array.isArray(parsed.events) ? parsed.events : []
    };
  } catch (error) {
    console.error('Unable to read analytics state:', error);
    return { visits: [], events: [] };
  }
}

function renderTrafficChart(visitLogs) {
  const chart = document.getElementById('trafficChart');
  const buckets = new Map();
  visitLogs.forEach(visit => {
    const date = new Date(visit.time || visit.date).toISOString().slice(0, 10);
    buckets.set(date, (buckets.get(date) || 0) + 1);
  });

  const dates = [...buckets.keys()].slice(-7);
  const max = Math.max(...[...buckets.values()].slice(-7), 1);
  chart.replaceChildren();
  dates.forEach((date) => {
    const bar = document.createElement('div');
    const count = buckets.get(date);
    bar.className = 'traffic-bar';
    bar.style.height = `${Math.max(18, (count / max) * 100)}%`;
    bar.setAttribute('data-label', new Date(date).toLocaleDateString('en-ZA', { day: 'numeric' }));
    chart.append(bar);
  });
}

function renderGrowthPlan(analytics) {
  const list = document.getElementById('growthPlan');
  const bookingCount = analytics.events.filter(event => event.type === 'booking_request').length;
  const reviewCount = analytics.events.filter(event => event.type === 'review_submission').length;
  const options = [
    '<strong>Google Business Profile</strong> · Free and essential for local SEO in Soshanguve and Pretoria',
    '<strong>Instagram + Reels</strong> · R400-R1,200/mo for boosted reach and client story content',
    '<strong>WhatsApp Business</strong> · Free to start; upgrade to catalog features if needed',
    '<strong>Google Ads</strong> · R800-R2,500/mo for high-intent local beauty searches',
    `<strong>Starter budget</strong> · ${bookingCount || reviewCount ? 'R1,500-R4,500/mo recommended' : 'R1,500-R4,500/mo recommended to grow leads quickly'}`
  ];
  list.replaceChildren();
  options.forEach(option => {
    const item = document.createElement('li');
    item.innerHTML = option;
    list.append(item);
  });
}

function renderServiceBreakdown(analytics) {
  const list = document.getElementById('serviceBreakdown');
  const services = new Map();
  analytics.events
    .filter(event => event.type === 'booking_request' && event.service)
    .forEach(event => {
      services.set(event.service, (services.get(event.service) || 0) + 1);
    });

  const items = [...services.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('li');
    const text = document.createElement('strong');
    text.textContent = 'No leads yet · Start collecting bookings and reviews to see demand';
    empty.append(text);
    list.append(empty);
    return;
  }
  items.forEach(([service, count]) => {
    const item = document.createElement('li');
    const label = document.createElement('strong');
    label.textContent = service;
    const total = document.createElement('span');
    total.textContent = `${count} lead${count > 1 ? 's' : ''}`;
    item.append(label, total);
    list.append(item);
  });
}

function renderAnalyticsDashboard() {
  const analytics = readAnalyticsState();
  const visitCount = analytics.visits.length;
  const uniqueDays = new Set(analytics.visits.map(visit => visit.date || visit.time.slice(0, 10))).size;
  const bookingCount = analytics.events.filter(event => event.type === 'booking_request').length;
  const reviewCount = analytics.events.filter(event => event.type === 'review_submission').length;

  document.getElementById('dashboardVisits').textContent = String(visitCount);
  document.getElementById('dashboardUniqueDays').textContent = String(uniqueDays);
  document.getElementById('dashboardBookings').textContent = String(bookingCount);
  document.getElementById('dashboardReviews').textContent = String(reviewCount);

  renderTrafficChart(analytics.visits);
  renderServiceBreakdown(analytics);
  renderGrowthPlan(analytics);
}

function showLogin(message = '') {
  loginPanel.hidden = false;
  dashboardPanel.hidden = true;
  loginMessage.textContent = message;
}

function showAccessError(message) {
  loginPanel.hidden = false;
  dashboardPanel.hidden = true;
  loginMessage.textContent = message;
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
  if (!roleRecord) {
    await supabase.auth.signOut();
    showAccessError('This account is not authorized to access the admin area.');
    return;
  }

  loginPanel.hidden = true;
  dashboardPanel.hidden = false;
  document.getElementById('adminRole').textContent =
    roleRecord.role === 'owner' ? 'Business owner' : 'Developer access';
  moderationPanel.hidden = roleRecord.role !== 'owner';
  developerNotice.hidden = roleRecord.role !== 'developer';
  renderAnalyticsDashboard();
  if (roleRecord.role === 'owner') {
    await Promise.all([showReviews(), showCatalogueItems(), showServiceRequests()]);
  }
  catalogueManagement.hidden = roleRecord.role !== 'owner';
  requestManagement.hidden = roleRecord.role !== 'owner';
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
    loginMessage.textContent = 'Sign-in failed. Check your credentials or contact the site administrator.';
    console.error('Admin sign-in failed:', error);
    return;
  }
  await loadAdmin(data.user);
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

document.getElementById('year').textContent = new Date().getFullYear();

if (!supabase) {
  showLogin('Supabase is not configured. Follow the setup steps in README.md.');
} else {
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      showLogin('Your sign-in session could not be checked. Please sign in again.');
      console.error('Unable to check admin session:', error);
      return;
    }
    if (data.session) loadAdmin(data.session.user);
    else showLogin();
  });
}
