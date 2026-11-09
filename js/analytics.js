import { SUPABASE_CONFIGURED, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const CART_KEY = 'glitzGlam.cart.v1';
const pageStartedAt = performance.now();
const activeCatalogueViews = new Map();
let catalogueObserver;
let catalogueFlushRegistered = false;
const pagePath = (() => {
  const file = window.location.pathname.split('/').pop();
  if (!file || file === 'index.html') return '/';
  return ['account.html', 'admin.html', 'privacy.html'].includes(file) ? `/${file}` : '/';
})();

function cartItemCount() {
  try {
    const saved = localStorage.getItem(CART_KEY);
    if (!saved) return 0;
    const items = JSON.parse(saved);
    if (!Array.isArray(items)) return 0;
    return Math.min(50, items.reduce((count, item) => {
      return count + (Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0);
    }, 0));
  } catch (error) {
    console.error('Unable to read the saved selection for anonymous analytics:', error);
    return 0;
  }
}

function sendAnalyticsRpc(functionName, payload) {
  if (!SUPABASE_CONFIGURED || pagePath === '/admin.html') return;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    keepalive: true,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).then(response => {
    if (!response.ok) throw new Error(`Analytics request failed with status ${response.status}`);
  }).catch(error => {
    console.error('Unable to record anonymous site analytics:', error);
  });
}

export function recordSiteEvent(eventType, { durationSeconds = 0, itemCount = 0, interest = null } = {}) {
  sendAnalyticsRpc('record_site_analytics', {
    p_event_type: eventType,
    p_page_path: pagePath,
    p_duration_seconds: Math.max(0, Math.min(86400, Math.round(durationSeconds))),
    p_item_count: Math.max(0, Math.min(50, Math.round(itemCount))),
    p_interest: interest
  });
}

function flushCatalogueView(card) {
  const activeView = activeCatalogueViews.get(card);
  if (!activeView) return;
  activeCatalogueViews.delete(card);
  const durationSeconds = Math.round((performance.now() - activeView.startedAt) / 1000);
  if (durationSeconds < 1) return;
  sendAnalyticsRpc('record_catalogue_item_view', {
    p_catalogue_item_id: activeView.catalogueItemId,
    p_duration_seconds: Math.min(86400, durationSeconds)
  });
}

export function observeCatalogueCard(card, catalogueItemId) {
  if (!SUPABASE_CONFIGURED || pagePath !== '/') return;
  if (!catalogueObserver) {
    catalogueObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (!activeCatalogueViews.has(entry.target)) {
            activeCatalogueViews.set(entry.target, {
              catalogueItemId: entry.target.dataset.catalogueItemId,
              startedAt: performance.now()
            });
          }
        } else {
          flushCatalogueView(entry.target);
        }
      });
    }, { threshold: [0, 0.5] });
  }
  card.dataset.catalogueItemId = catalogueItemId;
  catalogueObserver.observe(card);
  if (!catalogueFlushRegistered) {
    window.addEventListener('pagehide', () => {
      [...activeCatalogueViews.keys()].forEach(flushCatalogueView);
    }, { once: true });
    catalogueFlushRegistered = true;
  }
}

export function startAnalyticsPageTracking() {
  if (!SUPABASE_CONFIGURED || pagePath === '/admin.html') return;

  window.addEventListener('pagehide', () => {
    recordSiteEvent('page_view', {
      durationSeconds: (performance.now() - pageStartedAt) / 1000
    });
    if (pagePath === '/account.html') {
      const itemCount = cartItemCount();
      if (itemCount > 0) recordSiteEvent('cart_exit', { itemCount });
    }
  }, { once: true });
}
