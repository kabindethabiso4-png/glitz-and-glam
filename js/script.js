import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_CONFIGURED, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { observeCatalogueCard, recordSiteEvent, startAnalyticsPageTracking } from './analytics.js';

const WHATSAPP = '27655114153';
const IMAGE_BUCKET = 'review-images';
const MAX_IMAGE_COUNT = 3;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const cartKey = 'glitzGlam.cart.v1';
const voteVisitorKey = 'glitzGlam.reviewVoter.v1';
const voteChoiceKey = 'glitzGlam.reviewVotes.v1';
const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
const reviewForm = document.getElementById('reviewForm');
const reviewSignInPrompt = document.getElementById('reviewSignInPrompt');
const reviewSetupMessage = document.getElementById('reviewSetupMessage');

startAnalyticsPageTracking();
document.getElementById('year').textContent = new Date().getFullYear();

function updateReviewAccess(session) {
  const signedIn = Boolean(session?.user);
  reviewForm.hidden = !signedIn;
  reviewSignInPrompt.hidden = signedIn || !supabase;
  reviewSetupMessage.hidden = Boolean(supabase);
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, session) => updateReviewAccess(session));
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) {
      reviewForm.hidden = true;
      reviewSignInPrompt.hidden = true;
      reviewSetupMessage.hidden = false;
      reviewSetupMessage.textContent = 'Your sign-in could not be checked. Please refresh the page and try again.';
      console.error('Unable to check customer sign-in for review access:', error);
      return;
    }
    updateReviewAccess(data.session);
  });
} else {
  updateReviewAccess(null);
}

const burger = document.getElementById('burger');
const links = document.getElementById('links');
burger.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  burger.setAttribute('aria-expanded', open);
  burger.querySelector('use').setAttribute('href', open ? '#i-x' : '#i-menu');
});
links.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  links.classList.remove('open');
  burger.querySelector('use').setAttribute('href', '#i-menu');
}));

const hero = document.querySelector('.hero');
if (hero) {
  for (let i = 0; i < 18; i++) {
    const petal = document.createElement('i');
    petal.className = 'petal';
    petal.style.left = `${Math.random() * 100}%`;
    petal.style.setProperty('--drift', `${(Math.random() - 0.5) * 180}px`);
    petal.style.animationDuration = `${8 + Math.random() * 8}s`;
    petal.style.animationDelay = `${-Math.random() * 12}s`;
    hero.appendChild(petal);
  }
}

function count(el) {
  const total = Number(el.dataset.n);
  let current = 0;
  const timer = setInterval(() => {
    current += Math.ceil(total / 30);
    if (current >= total) {
      current = total;
      clearInterval(timer);
    }
    el.textContent = current;
  }, 40);
}

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      entry.target.querySelectorAll('[data-n]').forEach(count);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.rv').forEach((el, index) => {
  el.style.transitionDelay = `${(index % 4) * 90}ms`;
  observer.observe(el);
});

const date = document.getElementById('date');
const time = document.getElementById('time');
const availabilityMessage = document.getElementById('availabilityMessage');
const bookForm = document.getElementById('bookForm');
const now = new Date();
date.min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
let bookedPeriods = [];
let availabilityLoadedFor = '';
let availabilityRequest = 0;

function localDayBounds(day) {
  const [year, month, dateOfMonth] = day.split('-').map(Number);
  const start = new Date(year, month - 1, dateOfMonth);
  const end = new Date(year, month - 1, dateOfMonth + 1);
  return { start, end };
}

function formatLocalTime(value) {
  return new Date(value).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

async function loadBookedPeriods(day) {
  const requestId = ++availabilityRequest;
  availabilityLoadedFor = '';
  bookedPeriods = [];
  time.setCustomValidity('');
  if (!day) {
    availabilityMessage.textContent = 'Choose a date to check current availability.';
    return false;
  }
  if (!supabase) {
    availabilityMessage.textContent = 'Online availability is not configured. Please contact the studio to check this date.';
    return false;
  }

  availabilityMessage.textContent = 'Checking availability...';
  const { start, end } = localDayBounds(day);
  const { data, error } = await supabase
    .from('appointment_blocks')
    .select('starts_at, ends_at')
    .lt('starts_at', end.toISOString())
    .gt('ends_at', start.toISOString())
    .order('starts_at', { ascending: true });
  if (requestId !== availabilityRequest || day !== date.value) return false;
  if (error) {
    availabilityMessage.textContent = 'Availability could not be checked. Please contact the studio before requesting this time.';
    console.error('Unable to check appointment availability:', error);
    return false;
  }

  bookedPeriods = data;
  availabilityLoadedFor = day;
  availabilityMessage.textContent = bookedPeriods.length
    ? `Unavailable: ${bookedPeriods.map(period => `${formatLocalTime(period.starts_at)}–${formatLocalTime(period.ends_at)}`).join(', ')}.`
    : 'No blocked periods are listed for this date. The studio will confirm your request.';
  return true;
}

async function validateRequestedTime() {
  time.setCustomValidity('');
  if (!date.value || !time.value) return false;
  if (availabilityLoadedFor !== date.value && !await loadBookedPeriods(date.value)) return false;
  const requestedStart = new Date(`${date.value}T${time.value}`);
  const conflict = bookedPeriods.find(period => {
    return requestedStart >= new Date(period.starts_at) && requestedStart < new Date(period.ends_at);
  });
  if (conflict) {
    time.setCustomValidity('This start time is within a period already booked. Choose another time.');
    availabilityMessage.textContent = `That time is unavailable (${formatLocalTime(conflict.starts_at)}–${formatLocalTime(conflict.ends_at)}). Choose another time.`;
    time.reportValidity();
    return false;
  }
  return true;
}

date.addEventListener('change', () => loadBookedPeriods(date.value));
time.addEventListener('change', () => {
  if (availabilityLoadedFor === date.value) validateRequestedTime();
});

bookForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submitButton = bookForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  if (!await loadBookedPeriods(date.value) || !await validateRequestedTime()) {
    submitButton.disabled = false;
    if (!time.validationMessage && !date.value) availabilityMessage.textContent = 'Choose a date before requesting an appointment.';
    return;
  }
  const value = id => document.getElementById(id).value;
  const service = value('service');
  const text = `Hi Glitz & Glam! I would like to book.\nName: ${value('name')}\nPhone: ${value('phone')}\nService: ${service}\nDate: ${value('date')}\nTime: ${value('time')}` + (value('notes') ? `\nNotes: ${value('notes')}` : '');
  recordSiteEvent('booking_request', { interest: service });
  document.getElementById('msg').textContent = 'Opening WhatsApp to send your request...';
  window.location.assign(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`);
});

function readCart() {
  const raw = localStorage.getItem(cartKey);
  if (!raw) return [];
  const cart = JSON.parse(raw);
  if (!Array.isArray(cart) || cart.length > 50 || cart.some(item =>
    typeof item.id !== 'string' || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10
  ) || new Set(cart.map(item => item.id)).size !== cart.length) {
    throw new Error('Saved selection is not in the expected format.');
  }
  return cart;
}

function saveCart(cart) {
  localStorage.setItem(cartKey, JSON.stringify(cart));
}

function formatPrice(price) {
  return `R${Number(price).toFixed(2)}`;
}

function updateCart(products) {
  const cartItems = document.getElementById('cartItems');
  const cartCount = document.getElementById('cartCount');
  const cartTotal = document.getElementById('cartTotal');
  const continueButton = document.getElementById('continueRequest');
  const message = document.getElementById('catalogueMessage');
  let cart;
  let canContinue = true;
  try {
    cart = readCart();
  } catch (error) {
    message.textContent = 'Your saved selection was invalid and has been reset. Please choose your items again.';
    console.error('Unable to read the saved catalogue selection:', error);
    try {
      localStorage.removeItem(cartKey);
    } catch (storageError) {
      console.error('Unable to clear the invalid catalogue selection:', storageError);
    }
    cart = [];
  }
  cart = cart.filter(item => products.some(product => product.id === item.id));
  try {
    saveCart(cart);
  } catch (error) {
    message.textContent = 'Your selection could not be saved in browser storage.';
    console.error('Unable to save the catalogue selection:', error);
    canContinue = false;
  }

  const selectedProducts = cart.map(item => ({
    ...item,
    product: products.find(product => product.id === item.id)
  }));
  const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
  const total = selectedProducts.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
  cartCount.textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`;
  cartTotal.textContent = formatPrice(total);
  const unavailable = cart.length === 0 || !canContinue;
  continueButton.setAttribute('aria-disabled', String(unavailable));
  continueButton.classList.toggle('is-disabled', unavailable);
  cartItems.replaceChildren();

  if (!selectedProducts.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Choose catalogue items to build your request.';
    cartItems.append(empty);
    return;
  }

  selectedProducts.forEach(({ product, quantity }) => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = product.name;
    const price = document.createElement('span');
    price.textContent = `${formatPrice(product.price)} each`;
    details.append(name, price);

    const controls = document.createElement('div');
    controls.className = 'cart-controls';
    const decrease = document.createElement('button');
    decrease.type = 'button';
    decrease.className = 'quantity-button';
    decrease.textContent = '−';
    decrease.setAttribute('aria-label', `Remove one ${product.name}`);
    decrease.addEventListener('click', () => changeCartQuantity(product.id, -1, products));
    const quantityText = document.createElement('span');
    quantityText.textContent = String(quantity);
    const increase = document.createElement('button');
    increase.type = 'button';
    increase.className = 'quantity-button';
    increase.textContent = '+';
    increase.setAttribute('aria-label', `Add one ${product.name}`);
    increase.disabled = quantity >= 10;
    increase.addEventListener('click', () => changeCartQuantity(product.id, 1, products));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => changeCartQuantity(product.id, -quantity, products));
    controls.append(decrease, quantityText, increase, remove);
    row.append(details, controls);
    cartItems.append(row);
  });
}

function changeCartQuantity(productId, delta, products) {
  let cart;
  try {
    cart = readCart();
  } catch (error) {
    document.getElementById('catalogueMessage').textContent = 'Your saved selection was invalid and has been reset. Please choose your items again.';
    console.error('Unable to read the saved catalogue selection:', error);
    try {
      localStorage.removeItem(cartKey);
    } catch (storageError) {
      console.error('Unable to clear the invalid catalogue selection:', storageError);
    }
    return;
  }

  const selected = cart.find(item => item.id === productId);
  if (!selected && delta > 0) {
    if (cart.length >= 50) {
      document.getElementById('catalogueMessage').textContent = 'Your selection can include up to 50 different items.';
      return;
    }
    cart.push({ id: productId, quantity: Math.min(delta, 10) });
  } else if (selected) {
    selected.quantity += delta;
    if (selected.quantity <= 0) cart.splice(cart.indexOf(selected), 1);
    else selected.quantity = Math.min(selected.quantity, 10);
  }
  try {
    saveCart(cart);
    document.getElementById('catalogueMessage').textContent = '';
    updateCart(products);
  } catch (error) {
    document.getElementById('catalogueMessage').textContent = 'Your selection could not be saved. Check your browser storage and try again.';
    console.error('Unable to save the catalogue selection:', error);
    updateCart(products);
  }
}

async function showCatalogue() {
  const target = document.getElementById('catalogueItems');
  const message = document.getElementById('catalogueMessage');
  if (!supabase) {
    target.textContent = 'The catalogue is being set up. Please contact the studio for current services.';
    message.textContent = 'Catalogue data is unavailable until the secure service is configured.';
    return;
  }

  try {
    const { data: products, error } = await supabase
      .from('catalogue_items')
      .select('id, name, category, description, price')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;

    target.replaceChildren();
    const categories = [...new Set(products.map(product => product.category))];
    categories.forEach(category => {
      const group = document.createElement('section');
      group.className = 'catalogue-group';
      const title = document.createElement('h3');
      title.textContent = category;
      const items = products.filter(product => product.category === category);
      group.append(title);
      if (!items.length) {
        const empty = document.createElement('p');
        empty.className = 'empty-state';
        empty.textContent = 'New items coming soon.';
        group.append(empty);
      } else {
        const grid = document.createElement('div');
        grid.className = 'grid';
        items.forEach(product => {
          const card = document.createElement('article');
          card.className = 'card catalogue-card';
          const name = document.createElement('h4');
          name.textContent = product.name;
          const price = document.createElement('p');
          price.className = 'product-price';
          price.textContent = formatPrice(product.price);
          const description = document.createElement('p');
          description.textContent = product.description;
          const addButton = document.createElement('button');
          addButton.type = 'button';
          addButton.className = 'btn btn-small';
          addButton.textContent = 'Add to selection';
          addButton.addEventListener('click', () => changeCartQuantity(product.id, 1, products));
          card.append(name, price, description, addButton);
          observeCatalogueCard(card, product.id);
          grid.append(card);
        });
        group.append(grid);
      }
      target.append(group);
    });
    if (!products.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'New items coming soon.';
      target.append(empty);
    }
    message.textContent = '';
    updateCart(products);
  } catch (error) {
    target.textContent = 'The catalogue could not be loaded. Please try again later.';
    message.textContent = 'Please contact the studio if you need current catalogue details.';
    console.error('Unable to load the catalogue:', error);
  }
}

document.getElementById('continueRequest').addEventListener('click', event => {
  if (event.currentTarget.getAttribute('aria-disabled') === 'true') {
    event.preventDefault();
    document.getElementById('catalogueMessage').textContent = 'Add at least one catalogue item before continuing.';
  }
});

function voteVisitorId() {
  let id = localStorage.getItem(voteVisitorKey);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(voteVisitorKey, id);
  }
  return id;
}

function readVoteChoices() {
  try {
    const raw = localStorage.getItem(voteChoiceKey);
    if (!raw) return {};
    const choices = JSON.parse(raw);
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)) {
      throw new Error('Saved vote choices are not in the expected format.');
    }
    return choices;
  } catch (error) {
    console.error('Unable to read saved review votes:', error);
    return {};
  }
}

function makeVoteButton(count, isHelpful, reviewId, choices) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vote-button';
  button.textContent = `${isHelpful ? 'Helpful' : 'Not helpful'} (${count})`;
  button.setAttribute('aria-pressed', String(choices[reviewId] === isHelpful));
  button.addEventListener('click', async () => {
    if (!supabase) return;
    button.disabled = true;
    try {
      const { error } = await supabase.rpc('cast_review_vote', {
        p_review_id: reviewId,
        p_visitor_id: voteVisitorId(),
        p_is_helpful: isHelpful
      });
      if (error) throw error;
      const nextChoices = readVoteChoices();
      nextChoices[reviewId] = isHelpful;
      localStorage.setItem(voteChoiceKey, JSON.stringify(nextChoices));
      await showReviews();
    } catch (error) {
      button.disabled = false;
      console.error('Unable to save review vote:', error);
      const message = document.getElementById('reviewMessage');
      message.textContent = 'Your vote could not be saved. Please try again.';
    }
  });
  return button;
}

async function showReviews() {
  const list = document.getElementById('reviewList');
  const average = document.getElementById('averageRating');
  const count = document.getElementById('ratingCount');
  if (!supabase) {
    average.textContent = '—';
    count.textContent = 'Reviews are being set up';
    list.textContent = 'Reviews will appear here once the secure review service is configured.';
    return;
  }

  const { data: reviews, error } = await supabase
    .from('public_reviews')
    .select('id, first_name, last_initial, service, rating, body, photos, created_at, helpful_count, not_helpful_count')
    .order('created_at', { ascending: false });
  if (error) {
    list.textContent = 'Reviews could not be loaded. Please try again later.';
    console.error('Unable to load reviews:', error);
    return;
  }

  const total = reviews.reduce((sum, review) => sum + Number(review.rating), 0);
  average.textContent = reviews.length ? (total / reviews.length).toFixed(1) : '—';
  count.textContent = reviews.length === 1 ? '1 client review' : `${reviews.length} client reviews`;
  list.replaceChildren();
  if (!reviews.length) {
    const empty = document.createElement('div');
    empty.className = 'review-empty-state';
    const heading = document.createElement('h3');
    heading.textContent = 'A fresh page for your story';
    const message = document.createElement('p');
    message.textContent = 'There are no published reviews yet. Be the first to share your Glitz & Glam experience.';
    empty.append(heading, message);
    list.append(empty);
    return;
  }

  const choices = readVoteChoices();
  for (const review of reviews) {
    const card = document.createElement('article');
    card.className = 'review-card';
    const heading = document.createElement('div');
    heading.className = 'review-heading';
    const name = document.createElement('h3');
    name.textContent = `${review.first_name} ${review.last_initial}.`;
    const stars = document.createElement('span');
    stars.className = 'review-stars';
    stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
    stars.textContent = `${'★'.repeat(Number(review.rating))}${'☆'.repeat(5 - Number(review.rating))}`;
    heading.append(name, stars);

    const service = document.createElement('p');
    service.className = 'review-service';
    service.textContent = review.service;
    const text = document.createElement('p');
    text.textContent = review.body;
    const dateText = document.createElement('time');
    dateText.dateTime = review.created_at;
    dateText.textContent = new Date(review.created_at).toLocaleDateString();
    card.append(heading, service, text);

    if (review.photos.length) {
      const gallery = document.createElement('div');
      gallery.className = 'review-photos';
      for (const path of review.photos) {
        const { data, error: imageError } = await supabase.storage
          .from(IMAGE_BUCKET)
          .createSignedUrl(path, 3600);
        if (imageError) {
          console.error('Unable to load an approved review image:', imageError);
          continue;
        }
        const image = document.createElement('img');
        image.src = data.signedUrl;
        image.alt = `Photo shared by ${review.first_name} with a review`;
        image.loading = 'lazy';
        gallery.append(image);
      }
      if (gallery.childElementCount) card.append(gallery);
    }

    const votes = document.createElement('div');
    votes.className = 'review-votes';
    votes.setAttribute('aria-label', 'Was this review useful?');
    votes.append(
      makeVoteButton(Number(review.helpful_count), true, review.id, choices),
      makeVoteButton(Number(review.not_helpful_count), false, review.id, choices)
    );
    card.append(votes, dateText);
    list.append(card);
  }
}

reviewForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const message = document.getElementById('reviewMessage');
  const submitButton = form.querySelector('button[type="submit"]');
  const photos = Array.from(document.getElementById('reviewPhotos').files);
  if (!supabase) {
    message.textContent = 'The secure review service is not configured yet. Please contact the studio directly.';
    return;
  }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    message.textContent = 'Your sign-in could not be verified. Please try again.';
    console.error('Unable to verify review submitter:', sessionError);
    return;
  }
  const user = sessionData.session?.user;
  if (!user) {
    updateReviewAccess(null);
    message.textContent = 'Sign in to your customer account before submitting a review.';
    return;
  }
  if (photos.length > MAX_IMAGE_COUNT || photos.some(file =>
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > MAX_IMAGE_SIZE
  )) {
    message.textContent = 'Choose up to 3 JPEG, PNG or WebP images, each no larger than 5 MB.';
    return;
  }

  submitButton.disabled = true;
  message.textContent = 'Submitting your review...';
  const reviewId = crypto.randomUUID();
  const photoPaths = photos.map(file => {
    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
    return `${reviewId}/${crypto.randomUUID()}.${extension}`;
  });
  let uploadedPaths = [];
  let inserted = false;
  try {
    const { error: insertError } = await supabase.from('reviews').insert({
      id: reviewId,
      user_id: user.id,
      first_name: document.getElementById('reviewFirstName').value.trim(),
      last_name: document.getElementById('reviewLastName').value.trim(),
      whatsapp: document.getElementById('reviewWhatsApp').value.trim(),
      service: document.getElementById('reviewService').value,
      rating: Number(document.getElementById('reviewRating').value),
      body: document.getElementById('reviewText').value.trim(),
      photos: photoPaths
    });
    if (insertError) throw insertError;
    inserted = true;

    for (let index = 0; index < photos.length; index++) {
      const { error: uploadError } = await supabase.storage
        .from(IMAGE_BUCKET)
        .upload(photoPaths[index], photos[index], {
          contentType: photos[index].type,
          cacheControl: '3600',
          upsert: false
        });
      if (uploadError) throw uploadError;
      uploadedPaths.push(photoPaths[index]);
    }
    recordSiteEvent('review_submission');
    form.reset();
    message.textContent = 'Thank you. Your review has been sent to the studio for approval.';
  } catch (error) {
    console.error('Unable to submit review:', error);
    if (uploadedPaths.length) {
      const { error: cleanupError } = await supabase.storage.from(IMAGE_BUCKET).remove(uploadedPaths);
      if (cleanupError) console.error('Unable to remove incomplete review uploads:', cleanupError);
    }
    if (inserted) {
      const { error: cleanupError } = await supabase.from('reviews').delete().eq('id', reviewId);
      if (cleanupError) console.error('Unable to remove incomplete review submission:', cleanupError);
    }
    message.textContent = 'We could not submit your review. Please check your connection and try again.';
  } finally {
    submitButton.disabled = false;
  }
});

showCatalogue();
showReviews();
