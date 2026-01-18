import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_CONFIG = Object.freeze({
  url: "https://uajmdkxhvwjkueywenza.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVham1ka3hodndqa3VleXdlbnphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxMjc1MzgsImV4cCI6MjA4MzcwMzUzOH0.dhpymG0rBYf1iVNfgNVFnyRIvrFSM16aE1-zGuX4xfU",
  bucket: "karlittamarx"
});

if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
  console.warn("Supabase configuration missing: update js/supabase-client.js with real project credentials.");
}

const client = SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey
  ? createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  : null;

export const getSupabaseClient = () => client;

export const getSupabaseBucket = () => SUPABASE_CONFIG.bucket;

export const hasSupabaseConfig = () => Boolean(client);
