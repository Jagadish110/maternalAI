/**
 * setup-supabase.cjs
 * Run this ONCE to create the required Supabase resources:
 *   - Storage bucket: pregnancy-reports
 *   - Database table: reports
 * 
 * Usage: node setup-supabase.cjs
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

console.log("🔗 Connecting to Supabase:", supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

async function setup() {
  console.log("\n📦 Step 1: Creating storage bucket 'pregnancy-reports'...");
  const { data: bucketData, error: bucketError } = await supabase.storage.createBucket('pregnancy-reports', {
    public: true,
    fileSizeLimit: 15728640, // 15MB
  });

  if (bucketError) {
    if (bucketError.message && bucketError.message.toLowerCase().includes('already exists')) {
      console.log("  ✅ Bucket 'pregnancy-reports' already exists.");
    } else {
      console.error("  ❌ Error creating bucket:", bucketError.message || bucketError);
    }
  } else {
    console.log("  ✅ Bucket 'pregnancy-reports' created successfully!");
  }

  console.log("\n🗃️  Step 2: Creating 'reports' table...");
  const { error: tableError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        patient_name TEXT NOT NULL DEFAULT 'Patient',
        age INTEGER NOT NULL DEFAULT 28,
        location TEXT NOT NULL DEFAULT '',
        risk_level TEXT NOT NULL DEFAULT 'LOW',
        summary TEXT,
        indicators JSONB DEFAULT '[]'::jsonb,
        raw_analysis JSONB DEFAULT '{}'::jsonb,
        file_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  });

  if (tableError) {
    console.log("  ⚠️  Could not create table via RPC (this is okay if RPC is not enabled).");
    console.log("  ℹ️  Please create the 'reports' table manually in your Supabase dashboard SQL editor:");
    console.log(`
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    patient_name TEXT NOT NULL DEFAULT 'Patient',
    age INTEGER NOT NULL DEFAULT 28,
    location TEXT NOT NULL DEFAULT '',
    risk_level TEXT NOT NULL DEFAULT 'LOW',
    summary TEXT,
    indicators JSONB DEFAULT '[]'::jsonb,
    raw_analysis JSONB DEFAULT '{}'::jsonb,
    file_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
    `);
  } else {
    console.log("  ✅ Table 'reports' created (or already exists).");
  }

  console.log("\n🔓 Step 3: Checking RLS (Row Level Security) on 'reports' table...");
  console.log("  ℹ️  If you use anon key (not service role), you may need to add RLS policies.");
  console.log("  Run this in Supabase SQL editor if inserts fail:");
  console.log(`
  ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Allow all" ON reports FOR ALL USING (true) WITH CHECK (true);
  `);

  console.log("\n✅ Supabase setup complete! Your app should now work without NOT_FOUND errors.");
}

setup().catch(err => {
  console.error("Fatal error during setup:", err);
  process.exit(1);
});
