require('dotenv').config();

const mapsKey = process.env.GOOGLE_MAPS_API_KEY;

if (!mapsKey) {
  console.error("Missing GOOGLE_MAPS_API_KEY in .env");
  process.exit(1);
}

async function testMaps() {
  console.log("Testing Google Geocoding API...");
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=Chennai&key=${mapsKey}`;
  const geoRes = await fetch(geocodeUrl);
  const geoData = await geoRes.json();
  
  if (geoData.status !== "OK") {
    console.error("Geocoding failed:", geoData.status, geoData.error_message || "");
    return;
  }
  
  const lat = geoData.results[0].geometry.location.lat;
  const lng = geoData.results[0].geometry.location.lng;
  console.log(`Geocoded Chennai -> lat: ${lat}, lng: ${lng}`);
  
  console.log("\nTesting Google Places Nearby Search API...");
  const radius = 10000;
  const keyword = "maternity hospital gynecologist obstetrics prenatal clinic";
  const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=hospital&keyword=${encodeURIComponent(keyword)}&key=${mapsKey}`;
  
  const placesRes = await fetch(placesUrl);
  const placesData = await placesRes.json();
  
  console.log(`Places API Status: ${placesData.status}`);
  if (placesData.error_message) {
    console.log(`Error Message: ${placesData.error_message}`);
  }
  
  if (placesData.results) {
    console.log(`Found ${placesData.results.length} results.`);
    if (placesData.results.length > 0) {
      console.log("First result:", placesData.results[0].name);
    }
  }
}

testMaps().catch(console.error);
