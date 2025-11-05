import { supabase } from './supabaseClient';

export async function logActivity(operationName: string, opts?: { status?: string; timeText?: string; userName?: string }) {
  try {
    let userName = opts?.userName ?? null;
    if (!userName) {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData?.user?.email || null;
      if (email) {
        // Prefer username, then first+last, then email
        const { data: userRow } = await supabase
          .from('users')
          .select('username, user_firstname, user_lastname')
          .eq('user_email', email)
          .single();
        if (userRow?.username) {
          userName = userRow.username;
        } else if (userRow?.user_firstname || userRow?.user_lastname) {
          userName = `${userRow?.user_firstname || ''} ${userRow?.user_lastname || ''}`.trim();
        } else {
          userName = email;
        }
      }
    }
    const status = opts?.status || 'succeeded';
    const time = opts?.timeText ?? null;
    await supabase.from('activity_logs').insert({
      operation_name: operationName,
      status,
      time,
      user_name: userName
    } as any);
  } catch {
    // Swallow logging errors
  }
}


