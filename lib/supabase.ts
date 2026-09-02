import { createClient } from '@supabase/supabase-js';

// Public project credentials. Authorization is enforced by PostgreSQL RLS.
export const supabase = createClient(
  'https://svcpwtmccskohjfbjqfx.supabase.co',
  'sb_publishable_Wyh_d6HjSXAHzFkL6biI8A_D6hz8uOW',
);
