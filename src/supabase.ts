import { createClient } from "@supabase/supabase-js";

// Export the keys so the secondary auth client can use them
export const supabaseUrl = 'https://raokdggkibijfnjlxpsi.supabase.co';
export const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhb2tkZ2draWJpamZuamx4cHNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNDk2NzgsImV4cCI6MjEwNTgyNTY3OH0.2kccgSjzlnXy9T6q6pIXyBFXknmoJan0OjVvjapQEw4';

// The primary client for the application
export const supabase = createClient(supabaseUrl, supabaseKey);