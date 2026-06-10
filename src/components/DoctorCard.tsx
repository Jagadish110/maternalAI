import React from "react";
import { Star, MapPin, Phone, Globe, Navigation } from "lucide-react";
import { Doctor } from "../types";

interface DoctorCardProps {
  key?: any;
  id?: string;
  doctor: Doctor;
}

export default function DoctorCard({ id = "doctor-card", doctor }: DoctorCardProps) {
  // Render star ratings based on rating number
  const renderStars = (rating: number = 4.5) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    const stars = [];

    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(<Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />);
      } else if (i === fullStars + 1 && hasHalfStar) {
        stars.push(
          <div key={i} className="relative inline-block">
            <Star className="w-3.5 h-3.5 text-gray-200" />
            <div className="absolute top-0 left-0 overflow-hidden w-1/2">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            </div>
          </div>
        );
      } else {
        stars.push(<Star key={i} className="w-3.5 h-3.5 text-gray-200" />);
      }
    }
    return stars;
  };

  // Generate an elegant medical doctor initials avatar
  const getInitials = (nameString: string) => {
    const cleanName = nameString.replace(/^(Dr\.|Dr)\s+/i, "");
    const parts = cleanName.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleanName.substring(0, 2).toUpperCase();
  };

  return (
    <div
      id={id}
      className={`relative bg-white rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between border-2 ${
        doctor.aiRecommended
          ? "border-[#EB1367] ring-1 ring-[#EB1367]/20"
          : "border-gray-100"
      }`}
    >
      {/* AI Recommended Badge */}
      {doctor.aiRecommended && (
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 bg-[#EB1367] text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-md">
          <span>✨</span> AI Recommended
        </div>
      )}

      <div className={doctor.aiRecommended ? "mt-2" : ""}>
        {/* Header: Avatar + Name + Rating */}
        <div className="flex gap-3 items-start mb-3">
          <div
            className={`w-12 h-12 rounded-xl font-bold flex items-center justify-center shrink-0 text-sm ${
              doctor.aiRecommended
                ? "bg-[#FFF2F6] text-[#EB1367]"
                : "bg-blue-50 text-blue-600"
            }`}
          >
            {getInitials(doctor.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-gray-900 text-sm leading-tight line-clamp-2">
              {doctor.name}
            </h4>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-xs font-bold text-gray-700">{doctor.rating || 4.5}</span>
              <div className="flex items-center gap-0.5">
                {renderStars(doctor.rating)}
              </div>
              <span className="text-[10px] text-gray-400">
                ({(doctor.user_ratings_total || 0).toLocaleString()})
              </span>
            </div>
          </div>
        </div>

        {/* AI Reason */}
        {doctor.aiRecommended && doctor.aiReason && (
          <div className="mb-3 p-2.5 bg-[#FFF2F6] rounded-xl border border-[#FFCCD8]">
            <p className="text-[11px] text-[#EB1367] font-medium leading-normal">
              🤖 <strong>AI says:</strong> {doctor.aiReason}
            </p>
          </div>
        )}

        {/* Details */}
        <div className="space-y-2 text-xs text-gray-600 mb-4">
          <div className="flex gap-2 items-start">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
            <span className="leading-normal">{doctor.address}</span>
          </div>

          {doctor.phone && (
            <div className="flex gap-2 items-center">
              <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <a
                href={`tel:${doctor.phone}`}
                className="text-blue-600 hover:text-blue-800 font-medium transition-colors"
              >
                {doctor.phone}
              </a>
            </div>
          )}

          {doctor.website && (
            <div className="flex gap-2 items-center">
              <Globe className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <a
                href={doctor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 font-medium truncate transition-colors"
              >
                {doctor.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-3 border-t border-gray-100">
        <a
          href={doctor.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-all duration-200 ${
            doctor.aiRecommended
              ? "bg-[#EB1367] hover:bg-[#D0105C] text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          Get Directions
        </a>

        {doctor.website && (
          <a
            href={doctor.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-gray-500" />
            Website
          </a>
        )}

        {doctor.phone && (
          <a
            href={`tel:${doctor.phone}`}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold border border-green-200 hover:bg-green-50 text-green-700 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            Call
          </a>
        )}
      </div>
    </div>
  );
}
