const themeKey = 'glitzGlam.theme.v1';
const noticeKey = 'glitzGlam.themeNoticeDismissed.v1';
const root = document.documentElement;
const toggles = document.querySelectorAll('[data-theme-toggle]');
const notice = document.getElementById('themeNotice');
const dismissNotice = document.getElementById('dismissThemeNotice');

function readPreference(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error('Unable to read display preference:', error);
    return null;
  }
}

function setTheme(theme, persist = true) {
  root.dataset.theme = theme;
  toggles.forEach(button => {
    const dark = theme === 'dark';
    button.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} mode`);
    button.title = `Switch to ${dark ? 'light' : 'dark'} mode`;
    const label = button.querySelector('[data-theme-label]');
    if (label) label.textContent = dark ? 'Light' : 'Dark';
    const icon = button.querySelector('use');
    if (icon) icon.setAttribute('href', dark ? '#i-sun' : '#i-moon');
  });
  if (persist) {
    try {
      localStorage.setItem(themeKey, theme);
    } catch (error) {
      console.error('Unable to save display preference:', error);
    }
  }
}

const savedTheme = readPreference(themeKey);
if (savedTheme === 'light' || savedTheme === 'dark') {
  setTheme(savedTheme, false);
} else {
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  setTheme(systemTheme, false);
}

toggles.forEach(button => button.addEventListener('click', () => {
  const current = root.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(current === 'dark' ? 'light' : 'dark');
}));

if (notice && readPreference(noticeKey) !== 'true' && !savedTheme) {
  window.setTimeout(() => { notice.hidden = false; }, 1200);
}

if (dismissNotice) {
  dismissNotice.addEventListener('click', () => {
    notice.hidden = true;
    try {
      localStorage.setItem(noticeKey, 'true');
    } catch (error) {
      console.error('Unable to save display notice preference:', error);
    }
  });
}
