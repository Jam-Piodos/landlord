import { supabase } from './supabaseClient';

export async function logActivity(operationName: string, opts?: { status?: string; timeText?: string; userName?: string }) {
  try {
    let userName = opts?.userName ?? null;
    if (!userName) {
      const { data: authData } = await supabase.auth.getUser();
      userName = authData?.user?.email || null;
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


