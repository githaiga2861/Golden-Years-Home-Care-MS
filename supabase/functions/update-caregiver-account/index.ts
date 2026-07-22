// supabase/functions/update-caregiver-account/index.ts
//
// Lets office staff change a caregiver's Care App login email and/or
// password after it was first created. Same security model as
// create-caregiver-account: the service role key never leaves this
// server-side function.
//
// Deploy with: supabase functions deploy update-caregiver-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { caregiver_id, new_email, new_password } = await req.json()
    if (!caregiver_id) {
      return new Response(JSON.stringify({ error: 'caregiver_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!new_email && !new_password) {
      return new Response(JSON.stringify({ error: 'Provide a new email and/or password to update.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (new_password && new_password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Step 1: verify the caller is signed in and is office staff.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Invalid session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', caller.id).single()
    if (!callerProfile || !['admin', 'scheduler', 'coordinator'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Only office staff can edit caregiver logins.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Step 2: look up the caregiver's linked auth user id.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: cg, error: cgErr } = await adminClient.from('caregivers').select('profile_id').eq('id', caregiver_id).single()
    if (cgErr || !cg?.profile_id) {
      return new Response(JSON.stringify({ error: 'This caregiver has no linked login yet.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Step 3: update the auth user directly.
    const updates: Record<string, string> = {}
    if (new_email) updates.email = new_email
    if (new_password) updates.password = new_password
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(cg.profile_id, updates)
    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Keep profiles.email and caregivers.email in sync for display purposes.
    if (new_email) {
      await adminClient.from('profiles').update({ email: new_email }).eq('id', cg.profile_id)
    }

    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
