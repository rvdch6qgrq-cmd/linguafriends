import { createClient } from '@supabase/supabase-js'

// These are public client settings, safe to expose in a browser.
// Never place service_role keys or any secret keys in this repository.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://jejpbaxwaeaqxfcnysae.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable__GBE0sZzQTs8iPs3rB5k0g_nUGdZKkZ'

export const configured = !!url && !!key && !url.includes('YOUR-PROJECT') && !key.includes('REPLACE_ME')
export const supabase = configured ? createClient(url, key) : null
