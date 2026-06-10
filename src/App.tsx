// @ts-nocheck
import React, { useState, useEffect } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams, Link } from "react-router-dom";
import { 
  Heart, 
  User, 
  MapPin, 
  Calendar, 
  ArrowLeft, 
  FileText, 
  Stethoscope, 
  PlusCircle, 
  Compass, 
  Info, 
  ShieldCheck, 
  AlertCircle,
  Clock,
  ArrowRight
} from "lucide-react";
import FileUpload from "./components/FileUpload";
import RiskBadge from "./components/RiskBadge";
import IndicatorsTable from "./components/IndicatorsTable";
import DoctorsList from "./components/DoctorsList";
import LoadingSkeleton from "./components/LoadingSkeleton";
import { Report, Doctor } from "./types";
// @ts-ignore
import maternalCareBg from "./assets/images/maternal_care_bg_1781028557002.png";
import { supabase } from "./supabaseClient";

// Navbar / Header across pages
function Header({ user, onSignOut }: { user: any; onSignOut: () => void }) {
  const avatarUrl = user?.user_metadata?.avatar_url;
  const email = user?.email;
  const name = user?.user_metadata?.full_name || email;

  return (
    <header className="bg-[#fefaf6]/80 backdrop-blur-md border-b border-[#f3e9df] sticky top-0 z-50 transition-all duration-300">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-xl bg-[#c85a6a] hover:bg-[#b04b5a] flex items-center justify-center text-white shadow-sm transition-all duration-300 group-hover:scale-105">
            <Heart className="w-5 h-5 fill-white" />
          </div>
          <div>
            <span className="font-display font-bold text-xl text-gray-800 tracking-tight">MaternaAI</span>
            <span className="ml-1.5 px-2 py-0.5 rounded-full bg-[#fdf4f5] text-[10px] font-bold text-[#c85a6a] align-middle border border-[#fbdad2]">PREGNANCY CARE</span>
          </div>
        </Link>
        
        <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
          {user && (
            <div className="flex items-center gap-3 border-r border-[#f3e9df] pr-4">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full border border-[#fbdad2] shadow-xs" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#fdf4f5] text-[#c85a6a] border border-[#fbdad2] flex items-center justify-center font-bold">
                  {email ? email[0].toUpperCase() : "U"}
                </div>
              )}
              <div className="hidden md:block text-left">
                <div className="font-bold text-gray-800 text-xs truncate max-w-[120px]">{name}</div>
                <div className="text-[10px] text-gray-400 truncate max-w-[120px]">{email}</div>
              </div>
            </div>
          )}

          <span className="hidden sm:inline-flex items-center gap-1 text-[#618266] font-semibold bg-[#f4f7f4] px-2.5 py-1 rounded-full border border-[#e8efe8]">
            <span>●</span> Physician-Reviewed
          </span>

          {user ? (
            <button
              onClick={onSignOut}
              className="px-3 py-1.5 rounded-lg border border-[#f3e9df] hover:border-[#c85a6a] hover:bg-[#fdf4f5] text-gray-600 hover:text-[#c85a6a] font-bold transition-all text-xs cursor-pointer shadow-xs"
            >
              Sign Out
            </button>
          ) : (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#fdf4f5] text-[#c85a6a] font-bold border border-[#fbdad2]">
              <ShieldCheck className="w-3.5 h-3.5" /> Secure Storage
            </span>
          )}
        </div>
      </div>
    </header>
  );
}

// 1. Landing / Upload Page Component
function LandingView() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [location, setLocation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusStep, setStatusStep] = useState(0);

  // Status steps for the analyzer loader to engage patient
  const analyticSteps = [
    "Uploading pregnancy wellness report...",
    "Scanning report for biomarker fields...",
    "Gemini AI executing pregnancy risk assessment...",
    "Structuring indicators table database...",
    "Finished! Formulating clean summaries for you..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      interval = setInterval(() => {
        setStatusStep((prev) => (prev + 1) % analyticSteps.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Proactive geolocator to pre-fill city
  useEffect(() => {
    const fetchIPLocation = async () => {
      try {
        const response = await fetch("https://ipapi.co/json/");
        if (response.ok) {
          const data = await response.json();
          if (data.city && data.region_code) {
            setLocation(`${data.city}, ${data.region_code}`);
          } else if (data.city) {
            setLocation(data.city);
          }
        }
      } catch (err) {
        console.log("Geolocator was unable to resolve IP default city.");
      }
    };
    fetchIPLocation();
  }, []);

  const detectGPSLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Attempt reverse geocoding via standard free API
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          if (response.ok) {
            const data = await response.json();
            const city = data.address?.city || data.address?.town || data.address?.suburb || "Near GPS Location";
            const state = data.address?.state_code || data.address?.state || "";
            setLocation(state ? `${city}, ${state}` : city);
            // Persist coords for the Results page to use for doctor search
            sessionStorage.setItem("gpsLat", String(latitude));
            sessionStorage.setItem("gpsLon", String(longitude));
          } else {
            setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch (err) {
          setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        } finally {
          setIsDetecting(false);
        }
      },
      (err) => {
        console.error("GPS detection failed:", err);
        alert("Unable to fetch GPS position. Checking browser settings or entering manually is advised.");
        setIsDetecting(false);
      },
      { timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMsg("Please upload your pregnancy report file first.");
      return;
    }
    if (!location.trim()) {
      setErrorMsg("Location city is required to fetch nearby medical professionals.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setStatusStep(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("location", location);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errMsg = "Analyzing failed. Please check file format.";
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errMsg = errorData.error || errMsg;
        } else {
          const textError = await response.text();
          if (textError && textError.length < 200) {
            errMsg = textError;
          }
        }
        throw new Error(errMsg);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server did not return a valid JSON response. Please try again.");
      }

      const result = await response.json();
      if (result.reportId) {
        navigate(`/results/${result.reportId}`);
      } else {
        throw new Error("Missing report identifier from analysis response.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An error occurred during analyzing. Please try again.");
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 flex flex-col items-center justify-center text-center">
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-full border-4 border-[#fdf4f5] border-t-[#c85a6a] animate-spin" />
          <Heart className="w-8 h-8 text-[#c85a6a] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-current animate-pulse" />
        </div>
        <h2 className="text-2xl font-serif font-bold text-gray-800 mb-2">Analyzing Pregnancy Biomarkers</h2>
        <p className="text-amber-800/80 max-w-sm text-center text-sm md:text-base font-medium min-h-[3rem] transition-colors duration-300">
          {analyticSteps[statusStep]}
        </p>
        <div className="w-56 bg-[#f3e9df] h-1.5 rounded-full mt-6 overflow-hidden">
          <div className="bg-gradient-to-r from-[#c85a6a] to-[#e07a5f] h-1.5 rounded-full animate-pulse w-3/4 mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      {/* Decorative full watermark */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.05] bg-no-repeat bg-center bg-contain z-0 mt-20" 
        style={{ backgroundImage: `url(${maternalCareBg})` }}
      />
      
      {/* Intro section */}
      <div className="text-center max-w-3xl mx-auto mb-12 relative z-10">
        <span className="text-[11px] uppercase font-bold tracking-widest text-[#c85a6a] bg-[#fdf4f5] px-3.5 py-1.5 rounded-full border border-[#fbdad2] inline-block mb-4">
          🌸 Medical-Grade Pregnancy Wellness Scanner
        </span>
        <h1 className="font-serif font-bold text-4xl md:text-5xl text-gray-800 tracking-tight leading-tight mb-4">
          Gentle Care, <span className="text-[#c85a6a]">AI Precision</span>
        </h1>
        <p className="text-[#72645a] text-sm md:text-lg leading-relaxed max-w-2xl mx-auto">
          Securely scan clinical pregnancy reports, blood tests, and lab sheets. Receive simple summaries and map gynecologist consultations near you in seconds.
        </p>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch relative z-10">
        
        {/* Left Side: Upload & Location Form (7 Cols) */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 bg-[#fefaf6] border border-[#f3e9df] rounded-3xl p-6 md:p-8 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            <h2 className="text-lg font-display font-semibold text-gray-800 border-b border-[#f3e9df] pb-3.5 flex items-center gap-2">
              <Heart className="w-5 h-5 text-[#c85a6a] fill-[#fdf4f5]" />
              Step 1: Upload Pregnancy Report
            </h2>

            {errorMsg && (
              <div className="p-4 bg-red-50 border border-red-100 text-red-800 text-sm rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-5">
              {/* File upload */}
              <FileUpload onFileSelect={setFile} selectedFile={file} />
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Your Location / City</label>
                <div className="flex gap-2.5">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Boston, MA"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm bg-white focus:border-[#c85a6a] focus:ring-1 focus:ring-[#c85a6a] outline-hidden transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={detectGPSLocation}
                    disabled={isDetecting}
                    className="shrink-0 inline-flex items-center gap-1.5 px-4.5 py-3 text-xs font-bold bg-[#fdf4f5] hover:bg-[#fae2e5] text-[#c85a6a] rounded-xl border border-[#fbdad2] transition-all shadow-xs"
                  >
                    <Compass className={`w-4 h-4 ${isDetecting ? "animate-spin" : ""}`} />
                    {isDetecting ? "GPS..." : "Use GPS"}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 leading-normal">
                  Required to dynamically find Nearby Obstetricians & Prenatal clinics in your registry zone.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full py-4 rounded-xl font-bold bg-[#c85a6a] hover:bg-[#b04b5a] text-white shadow-md hover:shadow-lg transition-all duration-300 text-sm md:text-base flex items-center justify-center gap-2 group-hover:scale-[1.01]"
            >
              Analyze Pregnancy Report Details
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Right Side: Majestic Maternal Care Artwork Display & Pill Cards (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
          {/* Main Visual Image Card */}
          <div className="bg-[#fefaf6] border border-[#f3e9df] p-1.5 rounded-3xl shadow-sm overflow-hidden flex flex-col items-center h-full">
            <div className="w-full h-64 md:h-72 rounded-2xl overflow-hidden relative border border-[#f3e9df]">
              <img 
                src={maternalCareBg} 
                alt="Mother cradling child" 
                className="w-full h-full object-cover select-none pointer-events-none"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent p-4 flex items-end">
                <span className="text-white text-xs font-semibold uppercase tracking-widest bg-[#c85a6a]/90 backdrop-blur-xs px-2.5 py-1 rounded-md">
                  Empowering Motherhood
                </span>
              </div>
            </div>
            
            {/* Pregnancy parameter highlights */}
            <div className="p-5 w-full space-y-4">
              <h3 className="font-serif font-bold text-lg text-gray-800 flex items-center gap-2">
                <Info className="w-4.5 h-4.5 text-[#c85a6a]" />
                Primary Biomarkers Analyzed
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#fdf8f4] p-3 rounded-xl border border-[#f3e9df] hover:border-[#c85a6a]/40 transition-all duration-300">
                  <span className="text-[11px] font-bold text-[#c85a6a] uppercase block">Hemoglobin (Hb)</span>
                  <span className="text-xs text-gray-500 leading-tight block mt-0.5">Scans anemia risks and oxygen levels.</span>
                </div>
                <div className="bg-[#fdf8f4] p-3 rounded-xl border border-[#f3e9df] hover:border-[#c85a6a]/40 transition-all duration-300">
                  <span className="text-[11px] font-bold text-[#c85a6a] uppercase block">Blood Pressure</span>
                  <span className="text-xs text-gray-500 leading-tight block mt-0.5">Identifies early signs of preeclampsia.</span>
                </div>
                <div className="bg-[#fdf8f4] p-3 rounded-xl border border-[#f3e9df] hover:border-[#c85a6a]/40 transition-all duration-300">
                  <span className="text-[11px] font-bold text-[#c85a6a] uppercase block">Blood Glucose</span>
                  <span className="text-xs text-gray-500 leading-tight block mt-0.5">Tracks indicators of gestational diabetes.</span>
                </div>
                <div className="bg-[#fdf8f4] p-3 rounded-xl border border-[#f3e9df] hover:border-[#c85a6a]/40 transition-all duration-300">
                  <span className="text-[11px] font-bold text-[#c85a6a] uppercase block">Urine Proteins</span>
                  <span className="text-xs text-gray-500 leading-tight block mt-0.5">Monitors renal stresses & kidney loads.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}

// 2. Results Page Component
function ResultsView() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoadingReport, setIsLoadingReport] = useState(true);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [errorReport, setErrorReport] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<Record<number, boolean>>({});
  const [showDoctors, setShowDoctors] = useState(false);
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(null);

  // API Key instruction visual helper if keys are missing
  const GM_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_PLATFORM_KEY || "";
  const hasMapsKey = Boolean(GM_KEY);

  useEffect(() => {
    const fetchReport = async () => {
      setIsLoadingReport(true);
      setErrorReport(null);
      // Try to read persisted GPS coords from session
      const savedLat = sessionStorage.getItem("gpsLat");
      const savedLon = sessionStorage.getItem("gpsLon");
      if (savedLat && savedLon) {
        setGpsCoords({ lat: parseFloat(savedLat), lon: parseFloat(savedLon) });
      }
      try {
        const response = await fetch(`/api/reports/${id}`);
        if (!response.ok) {
          throw new Error("Unable to retrieve report. Confirm file existence.");
        }
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Clinical analysis response was not in a valid JSON format.");
        }
        const data = await response.json();
        setReport(data);
      } catch (err: any) {
        setErrorReport(err.message || "Failed loading clinical analysis.");
      } finally {
        setIsLoadingReport(false);
      }
    };

    if (id) fetchReport();
  }, [id]);

  const fetchDoctors = async (loc: string, coords?: { lat: number; lon: number } | null) => {
    setIsLoadingDoctors(true);
    try {
      // Use GPS coords if available for precise nearby search
      let url = `/api/doctors?location=${encodeURIComponent(loc)}`;
      if (coords) {
        url += `&lat=${coords.lat}&lon=${coords.lon}`;
      }
      const response = await fetch(url);
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          setDoctors(data);
        }
      }
    } catch (err) {
      console.error("Unable to query doctors database.", err);
    } finally {
      setIsLoadingDoctors(false);
    }
  };

  const toggleAction = (index: number) => {
    setActionDone((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  if (isLoadingReport) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <LoadingSkeleton type="table" />
      </div>
    );
  }

  if (errorReport || !report) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-red-500 mx-auto mb-4 border border-red-100">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2 font-display">Pregnancy Report Missing</h2>
        <p className="text-sm text-gray-500 mb-6">{errorReport || "The report could not be found or processed."}</p>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Go back to Upload
        </Link>
      </div>
    );
  }

  const creationDate = report.created_at
    ? new Date(report.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : new Date().toLocaleDateString();

  const isMediumOrHighRisk = report.risk_level === "MEDIUM" || report.risk_level === "HIGH";
  const isHighRisk = report.risk_level === "HIGH";

  // Reassuring messages or advice based on risk
  const getRiskExplanation = (level: string) => {
    if (level === "HIGH") {
      return {
        title: "Medical Consultation Required",
        desc: "Attention is needed on several bio-markers that are out of standard bounds. We highly advise bringing this report to your healthcare provider or visiting one of our nearby clinics shortly.",
        bgColor: "bg-red-50/50 border-red-100 text-red-950",
        indicatorColor: "text-red-500 fill-red-50"
      };
    }
    if (level === "MEDIUM") {
      return {
        title: "Observational Care Recommended",
        desc: "Some metrics deviate slightly from baseline pregnancy medians. We recommend scheduling a routine checkup soon to review these indicators and monitor updates.",
        bgColor: "bg-amber-50/50 border-amber-100 text-amber-950",
        indicatorColor: "text-amber-500 fill-amber-50"
      };
    }
    return {
      title: "Health Metrics look Good",
      desc: "All analyzed indices align comfortably within standard maternal ranges. Continue your prenatal vitamins, balanced nutrition, and scheduled routine visits.",
      bgColor: "bg-green-50/50 border-green-100 text-green-950",
      indicatorColor: "text-green-500 fill-green-50"
    };
  };

  const riskCardInfo = getRiskExplanation(report.risk_level);
  const actionsList = report.raw_analysis?.recommended_actions || [
    "Share report analysis data with your primary gynecologist.",
    "Observe blood pressure levels dynamically.",
    "Follow hydration charts closely.",
    "Monitor active fetal kicks daily."
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 relative">
      {/* Decorative full watermark */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.04] bg-no-repeat bg-center bg-contain z-0 mt-20" 
        style={{ backgroundImage: `url(${maternalCareBg})` }}
      />

      {/* Back button and Meta header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center relative z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#c85a6a] transition-colors py-1 pl-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Pregnancy Analyzer
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-[#fefaf6] px-3 py-1.5 rounded-full border border-[#f3e9df]">
            <Clock className="w-3.5 h-3.5 text-[#c85a6a]" /> Checked {creationDate}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 bg-[#fefaf6] px-3 py-1.5 rounded-full border border-[#f3e9df]">
            <MapPin className="w-3.5 h-3.5 text-[#c85a6a]" /> Near {report.location}
          </span>
        </div>
      </div>

      {/* Patient demographics summary */}
      <div className="bg-[#fefaf6] border border-[#f3e9df] rounded-3xl p-6 md:p-8 shadow-sm flex flex-col md:flex-row gap-6 justify-between items-start md:items-center relative z-10">
        <div className="space-y-1">
          <p className="text-xs uppercase font-bold text-[#c85a6a] tracking-wider">Analysis Result Suite</p>
          <h2 className="font-serif font-bold text-3xl text-gray-800 tracking-tight">
            Patient: {report.patient_name}
          </h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Age: {report.age} Years Old</span>
            <span>•</span>
            <span>Maternal Biomarker Report</span>
          </div>
        </div>
        
        {/* Risk levels badge */}
        <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0 self-stretch sm:self-auto pt-4 md:pt-0 border-t border-[#f3e9df] md:border-0">
          <p className="text-xs text-gray-400 font-medium md:text-right">Identified Risk Level</p>
          <RiskBadge level={report.risk_level} />
        </div>
      </div>

      {/* Risk Alert banner */}
      <div className={`p-6 rounded-2xl border ${riskCardInfo.bgColor} shadow-sm flex gap-4 relative z-10`}>
        <div className="shrink-0 mt-0.5">
          <AlertCircle className={`w-6 h-6 ${riskCardInfo.indicatorColor}`} />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 text-sm md:text-base leading-tight mb-1">
            {riskCardInfo.title}
          </h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            {riskCardInfo.desc}
          </p>
          
          <div className="flex flex-wrap gap-4 items-center mt-4">
            {report.file_url && (
              <a
                href={report.file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#c85a6a] hover:text-[#b04b5a] transition-colors"
              >
                <FileText className="w-3.5 h-3.5" /> View original medical document
              </a>
            )}
            
            {isHighRisk && !showDoctors && (
              <button
                onClick={() => {
                  setShowDoctors(true);
                  fetchDoctors(report.location, gpsCoords);
                }}
                className="inline-flex items-center gap-2 px-4.5 py-2.5 bg-[#c85a6a] hover:bg-[#b04b5a] text-white font-bold rounded-xl text-xs hover:shadow-md transition-all duration-200 cursor-pointer animate-pulse"
              >
                <Stethoscope className="w-4 h-4" />
                🗺️ Doctors Near You
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Two Column details: summary + table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative z-10">
        {/* Left: Summary + Recommended Actions */}
        <div className="lg:col-span-5 space-y-6">
          {/* Plain Summary */}
          <div className="bg-[#fefaf6] border border-[#f3e9df] rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-serif font-bold text-gray-800 flex items-center gap-2 border-b border-[#f3e9df] pb-2.5">
              <span className="w-1.5 h-5 bg-[#c85a6a] rounded-full" />
              Patient-Friendly Summary
            </h3>
            <p className="text-sm md:text-normal text-[#5a4d44] leading-relaxed whitespace-pre-line font-normal">
              {report.summary}
            </p>
          </div>

          {/* Recommended actions checklist */}
          <div className="bg-[#fefaf6] border border-[#f3e9df] rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-base font-serif font-bold text-gray-800 flex items-center gap-2 border-b border-[#f3e9df] pb-2.5">
              <PlusCircle className="w-4.5 h-4.5 text-[#c85a6a]" />
              Prenatal Recommendations
            </h3>
            <p className="text-xs text-gray-400">Warm custom items formulated based on report biomarkers:</p>
            <div className="space-y-3">
              {actionsList.map((action: string, idx: number) => (
                <div
                  key={idx}
                  onClick={() => toggleAction(idx)}
                  className={`flex gap-3 items-start p-3 rounded-xl border transition-all cursor-pointer select-none ${
                    actionDone[idx]
                      ? "bg-green-50/30 border-green-200 text-gray-400 line-through"
                      : "bg-white border-[#f3e9df] hover:border-[#c85a6a] hover:bg-[#fdf4f5]/10 text-gray-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!actionDone[idx]}
                    onChange={() => {}} // toggled on container click
                    className="w-4 h-4 mt-0.5 accent-green-600 shrink-0 cursor-pointer rounded-sm"
                  />
                  <span className="text-xs md:text-sm leading-normal font-medium">{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Key medical parameters indicators table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#fefaf6] border border-[#f3e9df] rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#f3e9df] pb-3">
              <h3 className="text-base font-serif font-bold text-gray-800 flex items-center gap-2">
                <FileText className="w-4.5 h-4.5 text-[#c85a6a]" />
                Laboratory Bio-Markers Extracted
              </h3>
              <span className="text-xs text-gray-400 font-semibold uppercase bg-[#fdf4f5] px-2.5 py-1 border border-[#fbdad2] rounded-full text-[#c85a6a]">
                {report.indicators?.length || 0} Indicators
              </span>
            </div>
            <IndicatorsTable indicators={report.indicators} />
          </div>
        </div>
      </div>

      {/* Nearby Doctors section */}
      {isHighRisk && showDoctors && (
        <section className="bg-[#fefaf6] border border-[#f3e9df] rounded-3xl p-6 md:p-8 shadow-sm space-y-6 relative z-10">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between border-b border-[#f3e9df] pb-4">
            <div>
              <h3 className="font-serif font-bold text-xl text-gray-800 tracking-tight flex items-center gap-2">
                <Stethoscope className="w-5.5 h-5.5 text-[#c85a6a]" /> Nearby Gynecologists & Prenatal Clinics
              </h3>
              <p className="text-xs md:text-sm text-gray-500 mt-1">
                <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 border border-amber-100 rounded-md">Priority checkups suggested.</span>
                {" "}Real clinics found near <strong className="text-gray-700">{report.location}</strong> via OpenStreetMap · AI-ranked best match shown first.
              </p>
            </div>

            <button
              onClick={() => fetchDoctors(report.location, gpsCoords)}
              disabled={isLoadingDoctors}
              className="shrink-0 inline-flex items-center justify-center px-4 py-2 text-xs font-bold bg-[#fdf4f5] hover:bg-[#fae2e5] text-[#c85a6a] border border-[#fbdad2] rounded-xl transition-colors cursor-pointer"
            >
              🔄 Refresh List
            </button>
          </div>

          {/* Doctors Grid rendering */}
          {isLoadingDoctors ? (
            <LoadingSkeleton type="doctors" />
          ) : (
            <DoctorsList doctors={doctors} location={report.location} />
          )}
        </section>
      )}
    </div>
  );
}

// Premium Sign In / Sign Up screen with Google + Email/Password
function LoginView() {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const sendConfirmationEmail = async (userEmail: string, userName: string, type: "signup" | "signin") => {
    try {
      await fetch("/api/auth/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, name: userName, type }),
      });
    } catch (e) {
      // Non-fatal — email failure doesn't block auth
      console.warn("Email notification failed:", e);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message || "Failed to initialize Google Sign-In.");
      setIsGoogleLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      if (tab === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        await sendConfirmationEmail(email, name || email, "signup");
        setSuccessMsg("✅ Account created! Check your inbox for a welcome confirmation email.");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const userName = data.user?.user_metadata?.full_name || email;
        await sendConfirmationEmail(email, userName, "signin");
        // Auth state listener will update session automatically
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12 relative">
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.05] bg-no-repeat bg-center bg-contain z-0 mt-20"
        style={{ backgroundImage: `url(${maternalCareBg})` }}
      />

      <div className="max-w-md w-full bg-[#fefaf6]/90 backdrop-blur-md border border-[#f3e9df] rounded-3xl p-8 md:p-10 shadow-lg text-center space-y-6 relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#c85a6a] flex items-center justify-center text-white shadow-md">
            <Heart className="w-7 h-7 fill-white animate-pulse" />
          </div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[#c85a6a] bg-[#fdf4f5] px-3 py-1 rounded-full border border-[#fbdad2]">
            PREGNANCY CARE SUITE
          </span>
        </div>

        <div className="space-y-1.5">
          <h1 className="font-serif font-bold text-3xl text-gray-800 tracking-tight leading-tight">
            Welcome to <span className="text-[#c85a6a]">MaternaAI</span>
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Your secure companion for prenatal analysis and clinical report summaries.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-[#fdf4f5] rounded-xl p-1 border border-[#fbdad2]">
          {(["signin", "signup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setSuccessMsg(null); }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                tab === t
                  ? "bg-white text-[#c85a6a] shadow-xs border border-[#fbdad2]"
                  : "text-gray-500 hover:text-[#c85a6a]"
              }`}
            >
              {t === "signin" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>

        {/* Error / Success alerts */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-100 text-red-800 text-xs rounded-xl text-left flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl text-left flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Email/Password form */}
        <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
          {tab === "signup" && (
            <div>
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                className="w-full px-4 py-3 rounded-xl border border-[#f3e9df] bg-white text-sm focus:border-[#c85a6a] focus:ring-1 focus:ring-[#c85a6a] outline-none transition-colors"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-4 py-3 rounded-xl border border-[#f3e9df] bg-white text-sm focus:border-[#c85a6a] focus:ring-1 focus:ring-[#c85a6a] outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === "signup" ? "Min. 6 characters" : "Your password"}
              className="w-full px-4 py-3 rounded-xl border border-[#f3e9df] bg-white text-sm focus:border-[#c85a6a] focus:ring-1 focus:ring-[#c85a6a] outline-none transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl font-bold bg-[#c85a6a] hover:bg-[#b04b5a] text-white shadow-sm hover:shadow-md transition-all duration-200 text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {isLoading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <>{tab === "signup" ? "Create Account" : "Sign In"}</>
            )}
            {isLoading ? "Please wait..." : ""}
          </button>
        </form>

        {/* Divider */}
        <div className="relative flex items-center gap-3">
          <div className="flex-1 h-px bg-[#f3e9df]" />
          <span className="text-xs text-gray-400 font-medium">or continue with</span>
          <div className="flex-1 h-px bg-[#f3e9df]" />
        </div>

        {/* Google Sign In */}
        <button
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading}
          className="w-full py-3.5 px-4 rounded-xl border border-[#f3e9df] hover:border-[#c85a6a]/40 bg-white hover:bg-[#fdf4f5]/50 shadow-xs hover:shadow-md transition-all duration-300 font-semibold text-gray-700 text-sm flex items-center justify-center gap-3 cursor-pointer group"
        >
          {isGoogleLoading ? (
            <div className="w-5 h-5 rounded-full border-2 border-gray-200 border-t-[#c85a6a] animate-spin" />
          ) : (
            <svg className="w-5 h-5 group-hover:scale-105 transition-transform" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <g>
                <path d="M21.35,11.1H12v2.7h5.38c-0.24,1.28-0.96,2.37-2.04,3.1v2.58h3.3c1.93-1.78,3.04-4.4,3.04-7.39c0-0.68-0.06-1.33-0.17-1.99Z" fill="#4285F4"/>
                <path d="M12,20.62c2.43,0,4.47-0.8,5.96-2.19l-3.3-2.58c-0.9,0.6-2.07,0.97-3.36,0.97c-2.34,0-4.33-1.58-5.04-3.71H2.83v2.66c1.49,2.96,4.54,4.85,8.08,4.85Z" fill="#34A853"/>
                <path d="M6.96,13.11c-0.18-0.54-0.29-1.11-0.29-1.71c0-0.6,0.11-1.17,0.29-1.71V7.03H2.83C2.21,8.27,1.85,9.68,1.85,11.4c0,1.72,0.36,3.13,0.98,4.37L6.96,13.11Z" fill="#FBBC05"/>
                <path d="M12,4.82c1.32,0,2.51,0.45,3.44,1.35l2.58-2.58C16.46,2.14,14.42,1.35,12,1.35C8.46,1.35,5.41,3.24,3.92,6.2L6.96,8.86c0.71-2.13,2.7-3.71,5.04-3.71Z" fill="#EA4335"/>
              </g>
            </svg>
          )}
          {isGoogleLoading ? "Connecting..." : "Continue with Google"}
        </button>

        <div className="pt-3 border-t border-[#f3e9df] flex items-center justify-between text-[11px] text-gray-400">
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
            <span>Encrypted Health Data</span>
          </div>
          <span>HIPAA Compliant Security</span>
        </div>
      </div>
    </div>
  );
}

// Root route dispatcher
export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fdf8f4] flex items-center justify-center">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-[#fdf4f5] border-t-[#c85a6a] animate-spin" />
          <Heart className="w-5 h-5 text-[#c85a6a] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fill-current animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="min-h-screen bg-[#fdf8f4] flex flex-col justify-between select-none">
        <div>
          <Header user={session?.user} onSignOut={handleSignOut} />
          <main className="pb-16 relative">
            {!session ? (
              <LoginView />
            ) : (
              <Routes>
                <Route path="/" element={<LandingView />} />
                <Route path="/results/:id" element={<ResultsView />} />
              </Routes>
            )}
          </main>
        </div>
        
        {/* humble footer */}
        <footer className="bg-[#fefaf6] border-t border-[#f3e9df] py-6 text-center text-xs text-gray-500">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
            <p>© 2026 MaternaAI. Secure HIPAA Pregnancy Care Platform.</p>
            <div className="flex gap-4">
              <span className="hover:text-[#c85a6a] cursor-pointer">Patient Privacy Guidelines</span>
              <span>•</span>
              <span className="hover:text-[#c85a6a] cursor-pointer">Terms of Medical Service</span>
            </div>
          </div>
        </footer>
      </div>
    </HashRouter>
  );
}
