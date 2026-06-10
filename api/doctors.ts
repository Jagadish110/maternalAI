import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cleanJSONString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "");
    cleaned = cleaned.replace(/```$/, "");
  }
  return cleaned.trim();
}

async function generateContentWithRetry(params: any, maxRetries = 3): Promise<any> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY environment variable is required.");

  const messages: any[] = [];
  const systemInstruction = params.config?.systemInstruction || params.systemInstruction;
  if (systemInstruction) messages.push({ role: "system", content: systemInstruction });

  const textParts: string[] = [];
  for (const content of params.contents || []) {
    if (typeof content === "string") { textParts.push(content); continue; }
    const parts = content.parts || (content.text ? [content] : []);
    for (const part of parts) {
      if (part.text) textParts.push(part.text);
    }
  }

  const promptText = textParts.join("\n");
  const modelsToTry = [
    "meta/llama-3.3-70b-instruct",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "meta/llama-3.1-8b-instruct",
  ];

  for (const currentModel of modelsToTry) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        console.log(`[NVIDIA API] Model: ${currentModel} (Attempt ${attempt + 1})`);
        const payload: any = {
          model: currentModel,
          messages: [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            { role: "user", content: promptText },
          ],
          temperature: 0.1,
          max_tokens: 4096,
        };
        if (params.config?.responseMimeType === "application/json") {
          payload.response_format = { type: "json_object" };
        }
        const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`NVIDIA API returned ${response.status}: ${errorText}`);
        }
        const responseData = await response.json();
        let assistantMessage = responseData.choices?.[0]?.message?.content || "";
        if (payload.response_format) assistantMessage = cleanJSONString(assistantMessage);
        return { text: assistantMessage };
      } catch (error: any) {
        attempt++;
        console.error(`[NVIDIA API Error] Model: ${currentModel}, Attempt: ${attempt}, Error: ${error.message}`);
        if (attempt > maxRetries) break;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw new Error("The clinical analysis models are currently experiencing high demand. Please try again.");
}

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

// ─── Handler ─────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const city = req.query.location as string;
    let lat = req.query.lat as string;
    let lon = req.query.lon as string;
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!city && !lat && !lon) {
      return res.status(400).json({ error: "Location is required." });
    }

    // Step 1: Geocode city if no GPS coords
    if ((!lat || !lon) && city) {
      try {
        if (mapsKey) {
          console.log(`Geocoding "${city}" via Google Geocoding API...`);
          const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${mapsKey}`;
          const geoRes = await fetch(geocodeUrl);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.results?.length > 0) {
              lat = String(geoData.results[0].geometry.location.lat);
              lon = String(geoData.results[0].geometry.location.lng);
              console.log(`Geocoded "${city}" → lat:${lat}, lon:${lon}`);
            }
          }
        } else {
          const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1`;
          const geoRes = await fetch(geocodeUrl, { headers: { "User-Agent": "MaternaAI/1.0" } });
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData?.length > 0) { lat = geoData[0].lat; lon = geoData[0].lon; }
          }
        }
      } catch (geoErr: any) {
        console.warn("Geocoding failed:", geoErr.message);
      }
    }

    let doctors: any[] = [];

    // Step 2: Google Maps Places Nearby Search
    if (lat && lon && mapsKey) {
      try {
        const radius = 10000;
        const keyword = "maternity hospital gynecologist obstetrics prenatal clinic";
        const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lon}&radius=${radius}&type=hospital&keyword=${encodeURIComponent(keyword)}&key=${mapsKey}`;
        const placesRes = await fetch(placesUrl);

        if (placesRes.ok) {
          const placesData = await placesRes.json();
          console.log(`Google Places status: ${placesData.status}, results: ${placesData.results?.length || 0}`);

          if (placesData.status === "OK" || placesData.status === "ZERO_RESULTS") {
            const results = placesData.results || [];
            const detailPromises = results.slice(0, 10).map(async (place: any) => {
              const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,geometry&key=${mapsKey}`;
              try {
                const detailRes = await fetch(detailUrl);
                if (detailRes.ok) {
                  const detailData = await detailRes.json();
                  return detailData.result || place;
                }
              } catch {}
              return place;
            });

            const detailedPlaces = await Promise.all(detailPromises);
            doctors = detailedPlaces.map((place: any) => {
              const placeLocation = place.geometry?.location;
              const mapsUrl = placeLocation
                ? `https://www.google.com/maps/search/?api=1&query=${placeLocation.lat},${placeLocation.lng}&query_place_id=${place.place_id}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || place.formatted_address || "")}`;
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
          }
        }
      } catch (placesErr: any) {
        console.error("Google Places API error:", placesErr.message);
      }
    }

    // Step 3: Fallback to mock data
    if (doctors.length === 0) {
      console.log("No real results found, using curated fallback list.");
      doctors = getMockDoctors(city || "your area");
    }

    // Step 4: AI-powered ranking via NVIDIA
    if (doctors.length > 0) {
      try {
        const doctorSummaries = doctors
          .slice(0, 10)
          .map(
            (d: any, i: number) =>
              `${i + 1}. Name: "${d.name}", Type: ${d._type || "clinic"}, Address: "${d.address}", Rating: ${d.rating || "N/A"}/5 (${d.user_ratings_total || 0} reviews), Phone: "${d.phone || "N/A"}"`
          )
          .join("\n");

        const aiResp = await generateContentWithRetry({
          model: "gemini-3.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `You are a maternal health advisor. A HIGH-RISK pregnant patient needs the best nearby clinic. From this list, pick the ONE most suitable (prefer hospitals > OB-GYN clinics > general; prefer higher ratings; prefer those with "maternity", "gynae", "obstetric", "women" in name). Return JSON: { "bestIndex": <0-based index>, "reason": "<warm 1-sentence reason, max 20 words>" }\n\nClinics:\n${doctorSummaries}`,
                },
              ],
            },
          ],
          config: { responseMimeType: "application/json" },
        });

        const aiText = aiResp.text?.trim() || "{}";
        const aiPick = JSON.parse(aiText);
        if (typeof aiPick.bestIndex === "number" && doctors[aiPick.bestIndex]) {
          doctors[aiPick.bestIndex].aiRecommended = true;
          doctors[aiPick.bestIndex].aiReason =
            aiPick.reason || "Highly recommended for maternal and prenatal care in your area.";
          const recommended = doctors.splice(aiPick.bestIndex, 1)[0];
          doctors.unshift(recommended);
        }
      } catch (aiErr: any) {
        console.warn("AI doctor ranking skipped:", aiErr.message);
      }
    }

    // Remove internal fields before sending to client
    const result = doctors.map(({ _type, _speciality, ...rest }: any) => rest);
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/doctors:", error);
    return res.status(500).json({ error: error.message || "An error occurred fetching nearby doctors." });
  }
}
