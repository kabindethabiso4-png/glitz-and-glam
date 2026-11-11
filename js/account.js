import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_CONFIGURED, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { startAnalyticsPageTracking } from './analytics.js';

const CART_KEY = 'glitzGlam.cart.v1';
const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const authPanel = document.getElementById('authPanel');
const accountPanel = document.getElementById('accountPanel');
const authMessage = document.getElementById('authMessage');
const accountMessage = document.getElementById('accountMessage');
const signInForm = document.getElementById('signInForm');
const signUpForm = document.getElementById('signUpForm');
const resetForm = document.getElementById('resetForm');
const requestForm = document.getElementById('requestForm');
const newPasswordForm = document.getElementById('newPasswordForm');

let activeUser = null;
startAnalyticsPageTracking();
document.getElementById('year').textContent = new Date().getFullYear();

function getPasswordSafetyChecks(value) {
  return {
    length: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value)
  };
}

function setupPasswordExperience(passwordId, confirmationId, visibilityId, strengthId, matchId) {
  const password = document.getElementById(passwordId);
  const confirmation = document.getElementById(confirmationId);
  const visibility = document.getElementById(visibilityId);
  const strength = document.getElementById(strengthId);
  const match = document.getElementById(matchId);

  if (!password || !confirmation || !visibility || !strength || !match) return;

  function updateStrength() {
    const value = password.value;
    const checks = getPasswordSafetyChecks(value);
    let passed = 0;
    Object.entries(checks).forEach(([name, satisfied]) => {
      const item = strength.querySelector(`[data-password-check="${name}"]`);
      if (item) {
        item.classList.toggle('is-satisfied', satisfied);
        const checkbox = item.querySelector('input');
        if (checkbox) checkbox.checked = satisfied;
      }
      passed += Number(satisfied);
    });
    const countDisplay = strength.querySelector('[data-strength-count]');
    if (countDisplay) {
      countDisplay.textContent = `${passed} of 5 safety checks passed`;
    }
  }

  function updateMatch() {
    if (!confirmation.value) {
      match.textContent = '';
      match.classList.remove('is-match', 'is-mismatch');
      return;
    }
    const matches = password.value === confirmation.value;
    match.textContent = matches ? 'Passwords match.' : 'Passwords do not match yet.';
    match.classList.toggle('is-match', matches);
    match.classList.toggle('is-mismatch', !matches);
  }

  function updatePasswords() {
    updateStrength();
    updateMatch();
  }

  password.addEventListener('input', updatePasswords);
  confirmation.addEventListener('input', updateMatch);
  visibility.addEventListener('change', () => {
    const type = visibility.checked ? 'text' : 'password';
    password.type = type;
    confirmation.type = type;
  });
  password.form.addEventListener('reset', () => window.setTimeout(() => {
    const type = visibility.checked ? 'text' : 'password';
    password.type = type;
    confirmation.type = type;
    updatePasswords();
  }, 0));
  updatePasswords();
}

setupPasswordExperience('signUpPassword', 'confirmSignUpPassword', 'showSignUpPasswords', 'signUpPasswordStrength', 'signUpPasswordMatch');
setupPasswordExperience('newPassword', 'confirmPassword', 'showNewPasswords', 'newPasswordStrength', 'newPasswordMatch');

function showAuthForm(form) {
  signInForm.hidden = form !== signInForm;
  signUpForm.hidden = form !== signUpForm;
  resetForm.hidden = form !== resetForm;
  document.getElementById('showReset').hidden = form === resetForm || form === signUpForm;
  document.getElementById('cancelReset').hidden = form !== resetForm;
  authMessage.textContent = '';
}

function setBusy(form, busy) {
  form.querySelectorAll('button[type="submit"]').forEach(button => {
    button.disabled = busy;
  });
}

function readCart() {
  const raw = localStorage.getItem(CART_KEY);
  if (!raw) return [];
  const cart = JSON.parse(raw);
  if (!Array.isArray(cart) || cart.length > 50 || cart.some(item =>
    typeof item.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10
  ) || new Set(cart.map(item => item.id)).size !== cart.length) {
    throw new Error('Saved selection is not in the expected format.');
  }
  return cart;
}

function formatPrice(price) {
  return `R${Number(price).toFixed(2)}`;
}

async function loadRequestSelection() {
  const target = document.getElementById('requestSelection');
  if (!target) return [];
  target.replaceChildren();
  let cart;
  try {
    cart = readCart();
  } catch (error) {
    target.textContent = 'Your saved selection could not be read. Return to the catalogue and choose your items again.';
    console.error('Unable to read the saved catalogue selection:', error);
    document.getElementById('submitRequest').disabled = true;
    return [];
  }

  if (!cart.length) {
    target.textContent = 'Your selection is empty. Add items from the catalogue before sending a request.';
    document.getElementById('submitRequest').disabled = true;
    return [];
  }

  const { data: products, error } = await supabase
    .from('catalogue_items')
    .select('id, name, price')
    .in('id', cart.map(item => item.id))
    .eq('is_active', true);

  if (error) {
    target.textContent = 'Your selection could not be checked. Please try again later.';
    accountMessage.textContent = 'The current catalogue could not be loaded.';
    console.error('Unable to load request catalogue items:', error);
    document.getElementById('submitRequest').disabled = true;
    return [];
  }

  const validIds = new Set(products.map(product => product.id));
  const validCart = cart.filter(item => validIds.has(item.id));
  if (validCart.length !== cart.length) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(validCart));
    } catch (storageError) {
      accountMessage.textContent = 'Your selection could not be updated in browser storage.';
      console.error('Unable to update the saved catalogue selection:', storageError);
      document.getElementById('submitRequest').disabled = true;
      return [];
    }
    accountMessage.textContent = 'Some items are no longer available and were removed from your selection.';
  }
  const entries = validCart.map(item => ({
    ...item,
    product: products.find(product => product.id === item.id)
  }));
  if (!entries.length) {
    target.textContent = 'The selected items are no longer available. Return to the catalogue to choose current items.';
    document.getElementById('submitRequest').disabled = true;
    return [];
  }

  let total = 0;
  entries.forEach(({ product, quantity }) => {
    total += Number(product.price) * quantity;
    const row = document.createElement('p');
    row.className = 'cart-item';
    const name = document.createElement('strong');
    name.textContent = `${product.name} × ${quantity}`;
    const price = document.createElement('span');
    price.textContent = formatPrice(Number(product.price) * quantity);
    row.append(name, price);
    target.append(row);
  });
  const totalLine = document.createElement('p');
  totalLine.className = 'cart-total';
  const totalLabel = document.createElement('strong');
  totalLabel.textContent = 'Estimated total';
  const totalPrice = document.createElement('strong');
  totalPrice.textContent = formatPrice(total);
  totalLine.append(totalLabel, totalPrice);
  target.append(totalLine);
  document.getElementById('submitRequest').disabled = false;
  return entries;
}

function renderHistory(requests) {
  const target = document.getElementById('requestHistory');
  if (!target) return;
  target.replaceChildren();
  if (!requests.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'You have not sent any catalogue requests yet.';
    target.append(empty);
    return;
  }

  requests.forEach(request => {
    const card = document.createElement('article');
    card.className = 'request-card';
    const heading = document.createElement('h3');
    heading.textContent = `Request · ${new Date(request.created_at).toLocaleDateString()}`;
    const status = document.createElement('span');
    status.className = 'request-status';
    status.textContent = request.status;
    const items = document.createElement('p');
    items.textContent = request.items
      .map(item => `${item.name} × ${item.quantity}`)
      .join(' · ');
    const total = document.createElement('p');
    total.textContent = `Estimated total: ${formatPrice(request.estimated_total)}`;
    card.append(heading, status, items, total);
    target.append(card);
  });
}

async function loadAccount(user) {
  if (!user) {
    accountPanel.hidden = true;
    authPanel.hidden = false;
    authMessage.textContent = 'Your sign-in has expired. Please sign in again.';
    return;
  }
  activeUser = user;
  authPanel.hidden = true;
  accountPanel.hidden = false;
  document.getElementById('accountEmail').textContent = user.email || 'Signed in';
  accountMessage.textContent = '';
  await loadRequestSelection();
  const { data: requests, error } = await supabase
    .from('service_requests')
    .select('id, items, estimated_total, status, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    document.getElementById('requestHistory').textContent = 'Your request history could not be loaded.';
    console.error('Unable to load customer requests:', error);
    return;
  }
  renderHistory(requests);
}

// Event Listeners for Authentication Nav toggles
document.getElementById('showSignIn').addEventListener('click', () => showAuthForm(signInForm));
document.getElementById('showSignUp').addEventListener('click', () => showAuthForm(signUpForm));
document.getElementById('showReset').addEventListener('click', () => showAuthForm(resetForm));
document.getElementById('cancelReset').addEventListener('click', () => showAuthForm(signInForm));

signInForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) {
    authMessage.textContent = 'Account services are not configured. Please contact the studio.';
    return;
  }
  setBusy(signInForm, true);
  authMessage.textContent = 'Signing in...';
  const { data, error } = await supabase.auth.signInWithPassword({
    email: document.getElementById('signInEmail').value.trim(),
    password: document.getElementById('signInPassword').value
  });
  setBusy(signInForm, false);
  if (error) {
    authMessage.textContent = `Sign-in failed: ${error.message}`;
    console.error('Customer sign-in failed:', error);
    return;
  }
  await loadAccount(data.user);
});

signUpForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = document.getElementById('signUpPassword').value;
  const confirmation = document.getElementById('confirmSignUpPassword').value;
  if (Object.values(getPasswordSafetyChecks(password)).some(passed => !passed)) {
    authMessage.textContent = 'Please complete all 5 password safety checks before creating your account.';
    document.getElementById('signUpPassword').focus();
    return;
  }
  if (password !== confirmation) {
    authMessage.textContent = 'The passwords do not match.';
    document.getElementById('confirmSignUpPassword').focus();
    return;
  }
  if (!supabase) {
    authMessage.textContent = 'Account services are not configured. Please contact the studio.';
    return;
  }
  setBusy(signUpForm, true);
  authMessage.textContent = 'Creating your account...';
  const { data, error } = await supabase.auth.signUp({
    email: document.getElementById('signUpEmail').value.trim(),
    password: document.getElementById('signUpPassword').value,
    options: { emailRedirectTo: new URL('account.html', window.location.href).href }
  });
  setBusy(signUpForm, false);
  if (error) {
    authMessage.textContent = `Your account could not be created: ${error.message}`;
    console.error('Customer sign-up failed:', error);
    return;
  }
  if (data.session) {
    await loadAccount(data.user);
  } else {
    authMessage.textContent = 'Account created. Check your email for a confirmation link, then sign in.';
    signUpForm.reset();
  }
});

resetForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) {
    authMessage.textContent = 'Account services are not configured. Please contact the studio.';
    return;
  }
  setBusy(resetForm, true);
  const email = document.getElementById('resetEmail').value.trim();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: new URL('account.html', window.location.href).href
  });
  setBusy(resetForm, false);
  if (error) {
    authMessage.textContent = 'A reset link could not be sent. Please try again later.';
    console.error('Password reset request failed:', error);
    return;
  }
  authMessage.textContent = 'If an account exists for that email, a password reset link will arrive shortly.';
  resetForm.reset();
});

requestForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!supabase) return;
  accountMessage.textContent = 'Sending your request...';
  const button = document.getElementById('submitRequest');
  button.disabled = true;
  let submitted = false;
  let successMessage = '';
  try {
    const selection = await loadRequestSelection();
    if (!selection.length) {
      accountMessage.textContent = 'Add available catalogue items before sending a request.';
      return;
    }
    button.disabled = true;
    const { error } = await supabase.rpc('create_service_request', {
      p_items: selection.map(({ id, quantity }) => ({ id, quantity })),
      p_contact_name: document.getElementById('contactName').value.trim(),
      p_phone: document.getElementById('contactPhone').value.trim(),
      p_customization: document.getElementById('customization').value.trim(),
      p_call_requested: document.getElementById('callRequested').checked
    });
    if (error) throw error;
    submitted = true;
    let selectionCleared = true;
    try {
      localStorage.removeItem(CART_KEY);
    } catch (storageError) {
      selectionCleared = false;
      console.error('Unable to clear the saved catalogue selection:', storageError);
    }
    requestForm.reset();
    successMessage = selectionCleared
      ? 'Your request has been sent. The studio will contact you to confirm the details.'
      : 'Your request has been sent, but your saved selection could not be cleared.';
    try {
      await loadAccount(activeUser);
    } catch (refreshError) {
      console.error('Unable to refresh the account after sending a request:', refreshError);
    }
    accountMessage.textContent = successMessage;
  } catch (error) {
    accountMessage.textContent = 'Your request could not be sent. Please check your connection and try again.';
    console.error('Unable to create customer request:', error);
  } finally {
    if (!submitted) await loadRequestSelection();
  }
});

document.getElementById('signOutButton').addEventListener('click', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    accountMessage.textContent = 'You could not be signed out. Please try again.';
    console.error('Customer sign-out failed:', error);
    return;
  }
  accountPanel.hidden = true;
  authPanel.hidden = false;
  activeUser = null;
  showAuthForm(signInForm);
  authMessage.textContent = 'You have been signed out.';
});

// Update Password Form Handler
if (newPasswordForm) {
  newPasswordForm.addEventListener('submit', async event => {
    event.preventDefault();
    const password = document.getElementById('newPassword').value;
    const confirmation = document.getElementById('confirmPassword').value;

    if (Object.values(getPasswordSafetyChecks(password)).some(passed => !passed)) {
      accountMessage.textContent = 'Please complete all 5 password safety checks before updating your password.';
      document.getElementById('newPassword').focus();
      return;
    }
    if (password !== confirmation) {
      accountMessage.textContent = 'The passwords do not match.';
      document.getElementById('confirmPassword').focus();
      return;
    }

    setBusy(newPasswordForm, true);
    accountMessage.textContent = 'Updating your password...';

    const { error } = await supabase.auth.updateUser({ password });
    setBusy(newPasswordForm, false);

    if (error) {
      accountMessage.textContent = `Your password could not be updated: ${error.message}`;
      console.error('Unable to update customer password:', error);
      return;
    }

    newPasswordForm.reset();
    newPasswordForm.hidden = true;
    accountMessage.textContent = 'Your password has been successfully updated! Redirecting...';

    setTimeout(() => {
      window.location.href = '/account.html';
    }, 2000);
  });
}

// Initialization and Recovery Link Token Handler
if (!supabase) {
  authMessage.textContent = 'Account services are not configured yet. Please contact the studio directly.';
} else {
  // Handle automatic token extraction and session setup on page load (Password Recovery)
  window.addEventListener('DOMContentLoaded', async () => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);

    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    const type = params.get('type');

    if (type === 'recovery' && access_token && refresh_token) {
      try {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) throw sessionError;

        // Clean tokens from the URL bar
        window.history.replaceState(null, '', window.location.pathname);

        authPanel.hidden = true;
        accountPanel.hidden = false;
        if (newPasswordForm) newPasswordForm.hidden = false;
        accountMessage.textContent = 'Recovery session verified! Please enter your new password below.';
        return;
      } catch (err) {
        console.error('Error setting recovery session:', err.message);
        accountMessage.textContent = 'Invalid or expired recovery link. Please request a new one.';
      }
    }

    // Standard session check
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        authMessage.textContent = 'Your sign-in session could not be checked. Please sign in again.';
        console.error('Unable to check customer session:', error);
        return;
      }
      if (data.session) {
        loadAccount(data.session.user);
      } else {
        showAuthForm(signInForm);
      }
    });
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session) {
      activeUser = session.user;
      authPanel.hidden = true;
      accountPanel.hidden = false;
      document.getElementById('accountEmail').textContent = session.user.email || 'Signed in';
      if (newPasswordForm) newPasswordForm.hidden = false;
      accountMessage.textContent = 'Choose a new password for your account.';
    }
  });
}
