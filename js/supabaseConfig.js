/**
 * Supabase — paste your project ref or full URL + anon key.
 * Dashboard: Settings → API
 */
const PROJECT_REF = 'kubtyfdryoxqngbxkdyw';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1YnR5ZmRyeW94cW5nYnhrZHl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzYzOTQsImV4cCI6MjA5ODMxMjM5NH0.puGs-9OsB_JU0t9uqI9LlWJuLDIipaTTT85Ur6XNhkc';

/** Full URL or just the project ref (e.g. kubtyfdryoxqngbxkdyw). */
export const SUPABASE_URL = PROJECT_REF;

export function resolveSupabaseUrl(raw = SUPABASE_URL) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s.replace(/\/$/, '');
  return `https://${s}.supabase.co`;
}

export function isSupabaseConfigured() {
  return Boolean(resolveSupabaseUrl() && SUPABASE_ANON_KEY);
}
