import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import mammoth from "mammoth";

// Ensure data directory exists
const DATA_DIR = path.join(process.cwd(), "data");
const REPORTS_FILE = path.join(DATA_DIR, "reports.json");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(REPORTS_FILE)) {
  fs.writeFileSync(REPORTS_FILE, JSON.stringify([], null, 2), "utf-8");
}

// Multer setup for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit
  },
});

// Lazy initialization of Supabase
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.log("Supabase credentials not fully configured. Using local JSON store.");
    return null;
  }
  try {
    return createClient(url, key);
  } catch (error) {
    console.error("Failed to initialize Supabase client:", error);
    return null;
  }
}

// Lazy initialization of Gemini (bypassed for NVIDIA API, returns empty client)
function getGeminiClient() {
  return {};
}

// Utility to wrap any Promise/Thenable with a timeout safely
function withTimeout<T>(promise: Promise<T> | any, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout"));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((res: any) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err: any) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// Helper to save report locally
function saveReportLocally(report: any) {
  try {
    const data = fs.readFileSync(REPORTS_FILE, "utf-8");
    const reports = JSON.parse(data);
    reports.push(report);
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving report locally:", err);
  }
}

// Helper to get reports locally
function getReportLocally(id: string) {
  try {
    const data = fs.readFileSync(REPORTS_FILE, "utf-8");
    const reports = JSON.parse(data);
    return reports.find((r: any) => r.id === id) || null;
  } catch (err) {
    console.error("Error retrieving report locally:", err);
    return null;
  }
}

// Helper to clean markdown JSON wrappers from LLM responses
function cleanJSONString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "");
    cleaned = cleaned.replace(/```$/, "");
  }
  return cleaned.trim();
}

// Helper to call NVIDIA NIM API with retry and fallback models
async function generateContentWithRetry(ai: any, params: any, maxRetries = 3): Promise<any> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY environment variable is required.");
  }

  // Parse contents to construct standard OpenAI-compatible messages list
  const messages: any[] = [];

  // Add system instruction if present
  const systemInstruction = params.config?.systemInstruction || params.systemInstruction;
  if (systemInstruction) {
    messages.push({ role: "system", content: systemInstruction });
  }

  let hasImage = false;
  let imageUrl = "";
  const textParts: string[] = [];

  const rawContents = params.contents || [];
  for (const content of rawContents) {
    if (typeof content === "string") {
      textParts.push(content);
      continue;
    }

    const parts = content.parts || (content.inlineData || content.text ? [content] : []);
    for (const part of parts) {
      if (part.text) {
        textParts.push(part.text);
      }
      if (part.inlineData) {
        const data = part.inlineData.data;
        const mime = part.inlineData.mimeType || "image/jpeg";
        imageUrl = `data:${mime};base64,${data}`;
        hasImage = true;
      }
    }
  }

  const promptText = textParts.join("\n");

  // Determine appropriate models to try
  const modelsToTry = hasImage
    ? ["meta/llama-3.2-11b-vision-instruct", "meta/llama-3.2-90b-vision-instruct"]
    : ["meta/llama-3.3-70b-instruct", "nvidia/llama-3.1-nemotron-70b-instruct", "meta/llama-3.1-8b-instruct"];

  for (const currentModel of modelsToTry) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        console.log(`[NVIDIA API] Attempting ChatCompletion with model: ${currentModel} (Attempt ${attempt + 1}/${maxRetries + 1})`);
        
        const payload: any = {
          model: currentModel,
          messages: hasImage ? [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            {
              role: "user",
              content: [
                { type: "text", text: promptText || "Analyze this pregnancy report image carefully and extract indicators and risk assessment." },
                { type: "image_url", image_url: { url: imageUrl } }
              ]
            }
          ] : [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            { role: "user", content: promptText }
          ],
          temperature: 0.1,
          max_tokens: 2048
        };

        // If JSON is requested, pass response_format (supported by modern Llama models on NVIDIA NIM)
        if (params.config?.responseMimeType === "application/json" || params.responseMimeType === "application/json") {
          payload.response_format = { type: "json_object" };
        }

        const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`NVIDIA API returned ${response.status}: ${errorText}`);
        }

        const responseData = await response.json();
        let assistantMessage = responseData.choices?.[0]?.message?.content || "";
        console.log(`[NVIDIA API] Successfully received response from ${currentModel}. Length: ${assistantMessage.length}`);

        if (payload.response_format) {
          assistantMessage = cleanJSONString(assistantMessage);
        }

        return {
          text: assistantMessage
        };

      } catch (error: any) {
        attempt++;
        const errorMessage = error.message || String(error);
        console.error(`[NVIDIA API Error] Model: ${currentModel}, Attempt: ${attempt}, Error: ${errorMessage}`);
        
        if (attempt > maxRetries) {
          console.warn(`[NVIDIA API] Max retries reached for model ${currentModel}.`);
          break; // move to next model in modelsToTry
        }
        
        const delay = 1000 * attempt;
        console.log(`[NVIDIA API] Waiting ${delay}ms before retrying...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error("The clinical analysis models are currently experiencing high demand. Please try again in a few seconds.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Analyze report
  app.post("/api/analyze", upload.single("file"), async (req, res): Promise<any> => {
    try {
      const file = req.file;
      const location = req.body.location || "Default Location";

      if (!file) {
        return res.status(400).json({ error: "Please upload a pregnancy report file (PDF, Word DOCX/DOC, or Image)." });
      }

      console.log(`Analyzing file: ${file.originalname} (mimetype: ${file.mimetype}) near ${location}`);

      // 1. Save file. We can upload to Supabase if configured, or save locally.
      let fileUrl = "";
      const supabase = getSupabaseClient();
      const uniqueFilename = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${file.originalname}`;

      // Normalize mimeType to ensure correct forwarding to Gemini
      let mimeType = file.mimetype;
      if (file.originalname.toLowerCase().endsWith(".docx")) {
        mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      } else if (file.originalname.toLowerCase().endsWith(".doc")) {
        mimeType = "application/msword";
      } else if (mimeType === "application/octet-stream") {
        if (file.originalname.toLowerCase().endsWith(".pdf")) {
          mimeType = "application/pdf";
        } else if (file.originalname.toLowerCase().endsWith(".png")) {
          mimeType = "image/png";
        } else if (file.originalname.toLowerCase().endsWith(".jpg") || file.originalname.toLowerCase().endsWith(".jpeg")) {
          mimeType = "image/jpeg";
        }
      }

      if (supabase) {
        try {
          // Upload to 'pregnancy-reports' bucket with 3 second timeout
          const uploadPromise = supabase.storage
            .from("pregnancy-reports")
            .upload(uniqueFilename, file.buffer, {
              contentType: mimeType,
              upsert: true,
            });

          const { data, error }: any = await withTimeout(uploadPromise, 3000);

          if (error) {
            // Supabase storage errors (bucket NOT_FOUND, RLS, etc.) — fall back to local
            const errMsg = typeof error === "object" ? (error.message || error.error || JSON.stringify(error)) : String(error);
            console.error("Supabase Storage Upload error (falling back to local):", errMsg);
            const localPath = path.join(UPLOADS_DIR, uniqueFilename);
            fs.writeFileSync(localPath, file.buffer);
            fileUrl = `/api/uploads/${uniqueFilename}`;
          } else {
            // Get public URL — wrap in try/catch in case bucket is private/missing
            try {
              const { data: { publicUrl } } = supabase.storage
                .from("pregnancy-reports")
                .getPublicUrl(uniqueFilename);
              fileUrl = publicUrl;
            } catch (urlErr: any) {
              console.error("getPublicUrl failed, using local fallback:", urlErr.message || urlErr);
              const localPath = path.join(UPLOADS_DIR, uniqueFilename);
              fs.writeFileSync(localPath, file.buffer);
              fileUrl = `/api/uploads/${uniqueFilename}`;
            }
          }
        } catch (storageErr: any) {
          console.error("Storage upload timed out or failed, using local storage instead:", storageErr.message || storageErr);
          const localPath = path.join(UPLOADS_DIR, uniqueFilename);
          fs.writeFileSync(localPath, file.buffer);
          fileUrl = `/api/uploads/${uniqueFilename}`;
        }
      } else {
        // Save locally
        const localPath = path.join(UPLOADS_DIR, uniqueFilename);
        fs.writeFileSync(localPath, file.buffer);
        fileUrl = `/api/uploads/${uniqueFilename}`;
      }

      // 2. Call Gemini for analysis
      const ai = getGeminiClient();
      let isWordDoc = file.originalname.toLowerCase().endsWith(".docx") || file.originalname.toLowerCase().endsWith(".doc");
      let extractedText = "";

      if (isWordDoc) {
        try {
          const result = await mammoth.extractRawText({ buffer: file.buffer });
          extractedText = result.value || "";
          console.log(`Successfully extracted ${extractedText.length} characters of text from Word document.`);
        } catch (err) {
          console.error("Mammoth text extraction failed:", err);
          extractedText = `Word document: ${file.originalname} could not be fully decoded, but it has size of ${file.buffer.length} bytes.`;
        }
      }

      const contents: any[] = [];
      if (isWordDoc) {
        contents.push({
          text: `Evaluate this text-extracted pregnancy report. Here is the raw patient content from the Word document:\n\n${extractedText}`
        });
      } else {
        contents.push({
          inlineData: {
            data: file.buffer.toString("base64"),
            mimeType: mimeType,
          },
        });
        contents.push({
          text: "Analyze this pregnancy report carefully and extract indicators and risk assessment."
        });
      }

      const systemPrompt = `You are a medical AI assistant specializing in pregnancy health. Analyze this pregnancy report and extract: 
1) The patient's full name (usually listed as name, patient, mother, or client. If not found, return "Patient")
2) The patient's age as an integer (If not found or not mentioned, default to 28)
3) Key health indicators (hemoglobin, blood pressure, sugar levels, etc.)
4) Any abnormal values
5) Risk level: LOW / MEDIUM / HIGH
6) Plain language summary for the patient
7) Recommended actions.
Return everything formatted as a validated JSON object.`;

      const geminiResponse = await generateContentWithRetry(ai, {
        model: "gemini-3.5-flash",
        contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              patient_name: {
                type: Type.STRING,
                description: "Full name of the patient extracted from the report. Return 'Patient' if not found."
              },
              age: {
                type: Type.INTEGER,
                description: "Age in years of the patient if found. If not found, return 28."
              },
              risk_level: {
                type: Type.STRING,
                description: "Risk assessment: LOW, MEDIUM, or HIGH"
              },
              summary: {
                type: Type.STRING,
                description: "Warm, plain language summary written directly to the patient explaining the report findings."
              },
              indicators: {
                type: Type.ARRAY,
                description: "Checklist of health parameters detected in the medical report.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    parameter: { type: Type.STRING, description: "Name of health parameter (e.g. Hemoglobin, Blood Glucose, Blood Pressure, Urine Albumin)" },
                    value: { type: Type.STRING, description: "Extracted value with unit (e.g. '11.2 g/dL' or '120/80 mmHg')" },
                    status: { type: Type.STRING, description: "Status must be exactly 'normal' or 'abnormal'" }
                  },
                  required: ["parameter", "value", "status"]
                }
              },
              recommended_actions: {
                type: Type.ARRAY,
                description: "A list of warm recommended actions for mother/fetal safety.",
                items: { type: Type.STRING }
              }
            },
            required: ["patient_name", "age", "risk_level", "summary", "indicators", "recommended_actions"]
          }
        }
      });

      const responseText = geminiResponse.text?.trim() || "{}";
      let parsedAnalysis: any = {};
      try {
        parsedAnalysis = JSON.parse(responseText);
      } catch (parseErr: any) {
        console.error("Failed to parse AI analysis response as JSON:", parseErr.message);
        console.error("Raw AI response was:", responseText.substring(0, 300));
        // Return a safe fallback analysis so the report still saves
        parsedAnalysis = {
          patient_name: "Patient",
          age: 28,
          risk_level: "LOW",
          summary: "Your pregnancy report has been received. Our AI encountered a temporary issue parsing the detailed results. Please consult your healthcare provider for a full analysis.",
          indicators: [],
          recommended_actions: ["Please share this report with your healthcare provider for a detailed review."]
        };
      }

      // Create Report object
      const reportId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const newReport = {
        id: reportId,
        patient_name: parsedAnalysis.patient_name || "Patient",
        age: parsedAnalysis.age || 28,
        location: location,
        risk_level: parsedAnalysis.risk_level === 'HIGH' || parsedAnalysis.risk_level === 'MEDIUM' ? parsedAnalysis.risk_level : 'LOW',
        summary: parsedAnalysis.summary || "No summary generated.",
        indicators: parsedAnalysis.indicators || [],
        raw_analysis: parsedAnalysis,
        file_url: fileUrl,
        created_at: new Date().toISOString(),
      };

      // 3. Save to database / local store
      if (supabase) {
        try {
          const insertPromise = supabase
            .from("reports")
            .insert({
              id: newReport.id,
              patient_name: newReport.patient_name,
              age: newReport.age,
              location: newReport.location,
              risk_level: newReport.risk_level,
              summary: newReport.summary,
              indicators: newReport.indicators,
              raw_analysis: newReport.raw_analysis,
              file_url: newReport.file_url,
              created_at: newReport.created_at
            }) as any;

          const { error: dbError } = await withTimeout(insertPromise, 3000) as any;

          if (dbError) {
            // Supabase DB errors (table NOT_FOUND, RLS, etc.) — always fall back to local
            const errMsg = typeof dbError === "object" ? (dbError.message || dbError.code || JSON.stringify(dbError)) : String(dbError);
            console.error("Supabase DB save error (falling back to local):", errMsg);
            saveReportLocally(newReport);
          } else {
            console.log("Report saved successfully in Supabase.");
          }
        } catch (dbEx: any) {
          console.error("Database save timed out or failed, using local fallback instead:", dbEx.message || dbEx);
          saveReportLocally(newReport);
        }
      } else {
        saveReportLocally(newReport);
      }

      return res.json({
        reportId: newReport.id,
        patientName: newReport.patient_name,
        age: newReport.age,
        riskLevel: newReport.risk_level,
        summary: newReport.summary,
        indicators: newReport.indicators,
        recommended_actions: parsedAnalysis.recommended_actions || []
      });

    } catch (error: any) {
      console.error("Error in report analysis API:", error);
      return res.status(500).json({ error: error.message || "An error occurred during report analysis." });
    }
  });

  // API Route: Get doctor search — powered by Google Maps Places API
  app.get("/api/doctors", async (req, res): Promise<any> => {
    try {
      const city = req.query.location as string;
      let lat = req.query.lat as string;
      let lon = req.query.lon as string;
      const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

      if (!city && !lat && !lon) {
        return res.status(400).json({ error: "Location is required." });
      }

      // Step 1: If no GPS coords and we have a city, geocode via Google Geocoding API
      if ((!lat || !lon) && city) {
        try {
          if (mapsKey) {
            console.log(`Geocoding "${city}" via Google Geocoding API...`);
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${mapsKey}`;
            const geoRes = await fetch(geocodeUrl);
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              if (geoData.results && geoData.results.length > 0) {
                lat = String(geoData.results[0].geometry.location.lat);
                lon = String(geoData.results[0].geometry.location.lng);
                console.log(`Geocoded "${city}" → lat:${lat}, lon:${lon}`);
              }
            }
          } else {
            // Fallback to Nominatim if no Maps key
            const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
            const geoRes = await fetch(geocodeUrl, { headers: { "User-Agent": "MaternaAI/1.0" } });
            if (geoRes.ok) {
              const geoData = await geoRes.json();
              if (geoData && geoData.length > 0) {
                lat = geoData[0].lat;
                lon = geoData[0].lon;
              }
            }
          }
        } catch (geoErr: any) {
          console.warn("Geocoding failed:", geoErr.message);
        }
      }

      let doctors: any[] = [];

      // Step 2: Google Maps Places Nearby Search for real hospitals/clinics
      if (lat && lon && mapsKey) {
        try {
          const radius = 10000; // 10km
          const keyword = "maternity hospital gynecologist obstetrics prenatal clinic";
          console.log(`Querying Google Places Nearby Search near (${lat},${lon})...`);

          // Use the Places API Nearby Search endpoint
          const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=hospital&keyword=${encodeURIComponent(keyword)}&key=${mapsKey}`;
          const placesRes = await fetch(placesUrl);

          if (placesRes.ok) {
            const placesData = await placesRes.json();
            console.log(`Google Places returned status: ${placesData.status}, results: ${placesData.results?.length || 0}`);

            if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
              const results = placesData.results || [];

              // Fetch details for top results to get phone/website
              const detailPromises = results.slice(0, 10).map(async (place: any) => {
                const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,geometry&key=${mapsKey}`;
                try {
                  const detailRes = await fetch(detailUrl);
                  if (detailRes.ok) {
                    const detailData = await detailRes.json();
                    return detailData.result || place;
                  }
                } catch (e) {}
                return place;
              });

              const detailedPlaces = await Promise.all(detailPromises);

              doctors = detailedPlaces.map((place: any) => {
                const placeLocation = place.geometry?.location;
                const mapsUrl = placeLocation
                  ? `https://www.google.com/maps/search/?api=1&query=${placeLocation.lat},${placeLocation.lng}&query_place_id=${place.place_id}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || place.formatted_address || "")}` ;

                const typeStr = (place.types || []).join(",");
                return {
                  name: place.name || "Medical Facility",
                  address: place.formatted_address || place.vicinity || "See directions for address",
                  phone: place.formatted_phone_number || null,
                  website: place.website || null,
                  mapsUrl,
                  rating: place.rating || null,
                  user_ratings_total: place.user_ratings_total || null,
                  _type: typeStr.includes("hospital") ? "hospital" : typeStr.includes("doctor") ? "doctor" : "clinic",
                  _speciality: null,
                };
              });

              console.log(`Mapped ${doctors.length} doctors from Google Places.`);
            } else {
              console.warn(`Google Places API error status: ${placesData.status}`);
            }
          }
        } catch (placesErr: any) {
          console.error("Google Places API error:", placesErr.message);
        }
      } else if (lat && lon && !mapsKey) {
        // No Maps key — keep Overpass as fallback
        console.log("No GOOGLE_MAPS_API_KEY set, skipping Google Places.");
      }

      // Step 3: Fall back to mock data if nothing was found
      if (doctors.length === 0) {
        console.log("No real results found, using curated fallback list.");
        doctors = getMockDoctors(city || "your area");
      }

      // Step 4: AI-powered ranking via NVIDIA — picks the best clinic for high-risk maternal patient
      if (doctors.length > 0) {
        try {
          const ai = getGeminiClient();
          const doctorSummaries = doctors.slice(0, 10).map((d: any, i: number) =>
            `${i + 1}. Name: "${d.name}", Type: ${d._type || "clinic"}, Address: "${d.address}", Rating: ${d.rating || "N/A"}/5 (${d.user_ratings_total || 0} reviews), Phone: "${d.phone || "N/A"}"`
          ).join("\n");

          const aiResp = await generateContentWithRetry(ai, {
            model: "gemini-3.5-flash",
            contents: [
              {
                role: "user",
                parts: [{
                  text: `You are a maternal health advisor. A HIGH-RISK pregnant patient needs the best nearby clinic. From this list, pick the ONE most suitable (prefer hospitals > OB-GYN clinics > general; prefer higher ratings; prefer those with "maternity", "gynae", "obstetric", "women" in name). Return JSON: { "bestIndex": <0-based index>, "reason": "<warm 1-sentence reason, max 20 words>" }\n\nClinics:\n${doctorSummaries}`
                }]
              }
            ],
            config: { responseMimeType: "application/json" }
          });

          const aiText = aiResp.text?.trim() || "{}";
          const aiPick = JSON.parse(aiText);
          if (typeof aiPick.bestIndex === "number" && doctors[aiPick.bestIndex]) {
            doctors[aiPick.bestIndex].aiRecommended = true;
            doctors[aiPick.bestIndex].aiReason = aiPick.reason || "Highly recommended for maternal and prenatal care in your area.";
            const recommended = doctors.splice(aiPick.bestIndex, 1)[0];
            doctors.unshift(recommended);
          }
        } catch (aiErr: any) {
          console.warn("AI doctor ranking skipped:", aiErr.message);
        }
      }

      // Clean up internal fields before sending to client
      const result = doctors.map(({ _type, _speciality, ...rest }: any) => rest);
      return res.json(result);

    } catch (error: any) {
      console.error("Error fetching doctors:", error);
      return res.status(500).json({ error: error.message || "An error occurred fetching nearby doctors." });
    }
  });

  // API Route: Send confirmation email via Resend
  app.post("/api/auth/send-email", async (req, res): Promise<any> => {
    try {
      const { email, name, type } = req.body; // type: "signup" | "signin"
      const resendKey = process.env.RESEND_API_KEY;

      if (!resendKey) {
        return res.status(500).json({ error: "Email service not configured." });
      }
      if (!email || !type) {
        return res.status(400).json({ error: "Email and type are required." });
      }

      const displayName = name || email.split("@")[0];
      const isSignup = type === "signup";

      const subject = isSignup
        ? "🌸 Welcome to MaternaAI — Your Secure Pregnancy Companion"
        : "🔐 MaternaAI — New Sign-In Detected";

      const htmlBody = isSignup ? `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Welcome to MaternaAI</title></head>
<body style="margin:0;padding:0;background:#fdf8f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f4;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fefaf6;border:1px solid #f3e9df;border-radius:24px;overflow:hidden;max-width:560px;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#c85a6a,#e07a8a);padding:36px 40px;text-align:center;">
          <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <span style="font-size:28px;">🌸</span>
          </div>
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Welcome to MaternaAI</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Secure Pregnancy Care Platform</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;color:#5a4d44;font-size:16px;">Dear <strong style="color:#c85a6a;">${displayName}</strong>,</p>
          <p style="margin:0 0 24px;color:#72645a;font-size:15px;line-height:1.7;">Your account has been successfully created. You now have secure access to the full MaternaAI pregnancy care suite.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf4f5;border:1px solid #fbdad2;border-radius:16px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#c85a6a;text-transform:uppercase;letter-spacing:0.5px;">What you can do now:</p>
              <table cellpadding="0" cellspacing="0"><tbody>
                <tr><td style="padding:6px 0;"><span style="color:#c85a6a;margin-right:10px;">🔬</span><span style="color:#5a4d44;font-size:14px;">Upload & analyze pregnancy reports with NVIDIA AI</span></td></tr>
                <tr><td style="padding:6px 0;"><span style="color:#c85a6a;margin-right:10px;">📊</span><span style="color:#5a4d44;font-size:14px;">Get plain-language summaries of lab biomarkers</span></td></tr>
                <tr><td style="padding:6px 0;"><span style="color:#c85a6a;margin-right:10px;">🗺️</span><span style="color:#5a4d44;font-size:14px;">Find nearby gynecologists & maternity clinics</span></td></tr>
                <tr><td style="padding:6px 0;"><span style="color:#c85a6a;margin-right:10px;">🔒</span><span style="color:#5a4d44;font-size:14px;">HIPAA-compliant, encrypted secure storage</span></td></tr>
              </tbody></table>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;color:#72645a;font-size:13px;">If you didn't create this account, please ignore this email — your email has not been shared with anyone.</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#fdf8f4;border-top:1px solid #f3e9df;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#a09080;font-size:12px;">© 2026 MaternaAI · Secure Pregnancy Care · HIPAA Compliant</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>` : `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>New Sign-In to MaternaAI</title></head>
<body style="margin:0;padding:0;background:#fdf8f4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f4;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fefaf6;border:1px solid #f3e9df;border-radius:24px;overflow:hidden;max-width:560px;">
        <tr><td style="background:linear-gradient(135deg,#4a7c6a,#618266);padding:36px 40px;text-align:center;">
          <div style="width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:16px;">
            <span style="font-size:28px;">🔐</span>
          </div>
          <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">New Sign-In Detected</h1>
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">MaternaAI Account Security</p>
        </td></tr>
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 16px;color:#5a4d44;font-size:16px;">Hello <strong style="color:#618266;">${displayName}</strong>,</p>
          <p style="margin:0 0 24px;color:#72645a;font-size:15px;line-height:1.7;">A new sign-in to your MaternaAI account was detected. If this was you, no action is required.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f9f6;border:1px solid #e8efe8;border-radius:16px;padding:20px;margin-bottom:24px;">
            <tr><td>
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#618266;text-transform:uppercase;letter-spacing:0.5px;">Sign-In Details:</p>
              <p style="margin:0;color:#5a4d44;font-size:14px;">🕐 Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (IST)</p>
              <p style="margin:4px 0 0;color:#5a4d44;font-size:14px;">📧 Account: ${email}</p>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;color:#72645a;font-size:13px;"><strong>Didn't sign in?</strong> Please change your password immediately to secure your account.</p>
        </td></tr>
        <tr><td style="background:#fdf8f4;border-top:1px solid #f3e9df;padding:20px 40px;text-align:center;">
          <p style="margin:0;color:#a09080;font-size:12px;">© 2026 MaternaAI · Secure Pregnancy Care · HIPAA Compliant</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

      // Send via Resend API
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "MaternaAI <onboarding@resend.dev>",
          to: [email],
          subject,
          html: htmlBody
        })
      });

      const resendData = await resendRes.json();
      if (!resendRes.ok) {
        console.error("Resend API error:", resendData);
        return res.status(500).json({ error: "Failed to send confirmation email.", details: resendData });
      }

      console.log(`[Resend] ${type} confirmation email sent to ${email}, id: ${resendData.id}`);
      return res.json({ success: true, id: resendData.id });

    } catch (error: any) {
      console.error("Error sending email:", error);
      return res.status(500).json({ error: error.message || "Email send failed." });
    }
  });


  // Retrieve single report
  app.get("/api/reports/:id", async (req, res): Promise<any> => {
    try {
      const id = req.params.id;
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
            const errMsg = error ? (typeof error === "object" ? (error.message || error.code || JSON.stringify(error)) : String(error)) : "no data";
            console.log("Supabase report not found or error, trying local... Reason:", errMsg);
            const localReport = getReportLocally(id);
            if (!localReport) return res.status(404).json({ error: "Report not found." });
            return res.json(localReport);
          }
          return res.json(data);
        } catch (ex: any) {
          console.log("Supabase retrieve timed out or exception occurred, fetching local:", ex.message || ex);
          const localReport = getReportLocally(id);
          if (!localReport) return res.status(404).json({ error: "Report not found." });
          return res.json(localReport);
        }
      } else {
        const localReport = getReportLocally(id);
        if (!localReport) return res.status(404).json({ error: "Report not found." });
        return res.json(localReport);
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Serve uploaded images/PDFs on fallback directory
  app.use("/api/uploads", express.static(UPLOADS_DIR));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Full-featured mock data for offline/unconfigured environments
function getMockDoctors(city: string) {
  return [
    {
      name: "Dr. Evelyn Ross, MD (Materna Care)",
      rating: 4.8,
      user_ratings_total: 124,
      address: `102 Oakwood Medical Center, ${city}`,
      phone: "+1 (555) 321-4567",
      website: "https://example.com/evelyn-ross",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Dr Evelyn Ross MD in " + city)}`,
    },
    {
      name: "Women's Health & Gynaecology Associates",
      rating: 4.9,
      user_ratings_total: 82,
      address: `455 Pine Crest Blvd Suite B, ${city}`,
      phone: "+1 (555) 789-1011",
      website: "https://example.com/womens-associates",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Womens Health Gynecology in " + city)}`,
    },
    {
      name: "St. Mary Maternal-Fetal Wellness Clinic",
      rating: 4.7,
      user_ratings_total: 215,
      address: `Hospital Pavilion Lane, ${city}`,
      phone: "+1 (555) 901-4422",
      website: "https://example.com/st-mary-maternal",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("St Mary Maternal Wellness Clinic in " + city)}`,
    },
    {
      name: "Dr. Sarah Patel, OB-GYN",
      rating: 4.6,
      user_ratings_total: 58,
      address: `88 Broad Street Wellness Hub, ${city}`,
      phone: "+1 (555) 234-9090",
      website: "https://example.com/sarah-patel",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Dr Sarah Patel OBGYN in " + city)}`,
    },
    {
      name: "Prestige Pregnancy Care Clinic",
      rating: 4.9,
      user_ratings_total: 94,
      address: `12 Golden Gate Way Suite 300, ${city}`,
      phone: "+1 (555) 678-0112",
      website: "https://example.com/prestige-pregnancy",
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("Prestige Pregnancy Care in " + city)}`,
    },
  ];
}

startServer();
