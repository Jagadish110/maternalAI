import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

// ─── In-memory fallback (survives within a warm lambda invocation) ───────────
const inMemoryReports: Map<string, any> = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  if (serviceKey && anonKey && serviceKey === anonKey) return null;
  try {
    return createClient(url, key);
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T> | any, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    Promise.resolve(promise)
      .then((res: any) => { clearTimeout(timer); resolve(res); })
      .catch((err: any) => { clearTimeout(timer); reject(err); });
  });
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const id = req.query.id as string;

    if (!id) {
      return res.status(400).json({ error: "Report ID is required." });
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const selectPromise = supabase
          .from("reports")
          .select("*")
          .eq("id", id)
          .single() as any;

        const { data, error } = await withTimeout(selectPromise, 2500) as any;

        if (error || !data) {
          const errMsg = error
            ? typeof error === "object"
              ? error.message || error.code || JSON.stringify(error)
              : String(error)
            : "no data";
          console.log("Supabase report not found or error, trying in-memory... Reason:", errMsg);
          const localReport = inMemoryReports.get(id);
          if (!localReport) return res.status(404).json({ error: "Report not found." });
          return res.json(localReport);
        }
        return res.json(data);
      } catch (ex: any) {
        console.log("Supabase retrieve timed out or exception:", ex.message || ex);
        const localReport = inMemoryReports.get(id);
        if (!localReport) return res.status(404).json({ error: "Report not found." });
        return res.json(localReport);
      }
    } else {
      const localReport = inMemoryReports.get(id);
      if (!localReport) return res.status(404).json({ error: "Report not found." });
      return res.json(localReport);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
