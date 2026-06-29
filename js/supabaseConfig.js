/**
 * Supabase setup — paste your project keys here.
 *
 * 1. Go to https://supabase.com → your project → Settings → API
 * 2. Copy "Project URL" and "anon public" key below
 * 3. Run the SQL in supabase/setup.sql (SQL Editor in dashboard)
 */
export const SUPABASE_URL = 'kubtyfdryoxqngbxkdyw';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1YnR5ZmRyeW94cW5nYnhrZHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzYzOTQsImV4cCI6MjA5ODMxMjM5NH0.puGs-9OsB_JU0t9uqI9LlWJuLDIipaTTT85Ur6XNhkc';

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
