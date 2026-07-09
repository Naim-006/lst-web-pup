import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email');
  const linkToken = req.nextUrl.searchParams.get('link_token');
  if (!email || !linkToken) {
    return NextResponse.json({ error: 'Missing email or link_token' }, { status: 400 });
  }

  const { data: link } = await supabase
    .from('pupil_invite_links')
    .select('id, instructor_id')
    .eq('token', linkToken)
    .single();

  if (!link) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const emailLower = email.toLowerCase();

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', emailLower)
    .eq('role', 'pupil')
    .maybeSingle();

  const { data: activePupil } = await admin
    .from('pupils')
    .select('id')
    .eq('instructor_id', link.instructor_id)
    .eq('email', emailLower)
    .neq('status', 'cancelled')
    .maybeSingle();

  return NextResponse.json({ exists: !!existingProfile || !!activePupil });
}
