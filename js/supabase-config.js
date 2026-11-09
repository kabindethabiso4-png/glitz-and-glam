

export const SUPABASE_URL = 'https://spbilxwnuoglvwunbqgg.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'YOUR_SUPABASE_PUBLISHABLE_KEY';
export const SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;

export const SUPABASE_CONFIGURED =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) &&
  SUPABASE_PUBLISHABLE_KEY.trim() !== '' &&
  SUPABASE_PUBLISHABLE_KEY !== 'YOUR_SUPABASE_PUBLISHABLE_KEY';