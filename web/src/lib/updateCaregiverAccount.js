import { supabase } from './supabase'

/**
 * Calls the update-caregiver-account Edge Function to change a caregiver's
 * existing Care App login email and/or password. Like account creation,
 * the service role key that makes this possible lives only on Supabase's
 * server — never in this file, never in the browser.
 */
export async function updateCaregiverAccount({ caregiverId, newEmail, newPassword }) {
  const { data, error } = await supabase.functions.invoke('update-caregiver-account', {
    body: { caregiver_id: caregiverId, new_email: newEmail || undefined, new_password: newPassword || undefined },
  })
  if (error) {
    const detail = data?.error || error.context?.body?.error || error.message
    return { ok: false, error: detail }
  }
  if (data?.error) return { ok: false, error: data.error }
  return { ok: true }
}
