'use client';

import { supabase } from '@/lib/supabase';

// supabase-js detects and exchanges the recovery code during module load,
// then strips it from the URL. By subscribing here at module scope we catch
// PASSWORD_RECOVERY on whatever page the link lands on (including "/").
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' && !window.location.pathname.startsWith('/reset-password')) {
      window.location.replace('/reset-password');
    }
  });
}

export default function RecoveryRedirect() {
  return null;
}
