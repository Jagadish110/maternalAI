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

function normalizeReport(report: any) {
  if (!report) return report;
  
  // 1. Normalize summary
  if (!report.summary || report.summary === "No summary generated.") {
    const raw = report.raw_analysis || {};
    report.summary = raw.summary || raw.plain_language_summary || raw.plainLanguageSummary || "No summary generated.";
  }
  
  // 2. Normalize indicators
  if (!report.indicators || report.indicators.length === 0) {
    const raw = report.raw_analysis || {};
    if (raw.indicators && raw.indicators.length > 0) {
      report.indicators = raw.indicators;
    } else if (raw.key_health_indicators) {
      const abnormalList: string[] = [];
      if (Array.isArray(raw.abnormal_values)) {
        raw.abnormal_values.forEach((v: any) => abnormalList.push(String(v).toLowerCase()));
      } else if (raw.abnormal_values && typeof raw.abnormal_values === "object") {
        Object.entries(raw.abnormal_values).forEach(([k, v]) => {
          abnormalList.push(String(k).toLowerCase());
          abnormalList.push(String(v).toLowerCase());
        });
      }
      
      report.indicators = Object.entries(raw.key_health_indicators).map(([key, val]) => {
        const parameter = key
          .split(/[_-]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        
        const isAbnormal = abnormalList.some((abVal: string) => 
          abVal.includes(key.toLowerCase()) || 
          abVal.includes(parameter.toLowerCase())
        );
        
        return {
          parameter,
          value: String(val),
          status: isAbnormal ? "abnormal" : "normal"
        };
      });
    }
  }
  
  return report;
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
          return res.json(normalizeReport(localReport));
        }
        return res.json(normalizeReport(data));
      } catch (ex: any) {
        console.log("Supabase retrieve timed out or exception:", ex.message || ex);
        const localReport = inMemoryReports.get(id);
        if (!localReport) return res.status(404).json({ error: "Report not found." });
        return res.json(normalizeReport(localReport));
      }
    } else {
      const localReport = inMemoryReports.get(id);
      if (!localReport) return res.status(404).json({ error: "Report not found." });
      return res.json(normalizeReport(localReport));
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
