console.log('🔌 Supabase init');
const supabaseClient = supabase.createClient(
    window.CONFIG.SUPABASE_URL,
    window.CONFIG.SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
);
window.supabase = supabaseClient;