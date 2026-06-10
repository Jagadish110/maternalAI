import React from "react";

interface SkeletonProps {
  type: "table" | "doctors" | "report";
}

export default function LoadingSkeleton({ type }: SkeletonProps) {
  if (type === "table") {
    return (
      <div className="w-full animate-pulse space-y-4">
        <div className="h-10 bg-gray-100 rounded-lg w-full" />
        <div className="space-y-3">
          <div className="h-14 bg-gray-50 rounded-lg w-full" />
          <div className="h-14 bg-gray-50 rounded-lg w-full" />
          <div className="h-14 bg-gray-50 rounded-lg w-full" />
          <div className="h-14 bg-gray-50 rounded-lg w-full" />
        </div>
      </div>
    );
  }

  if (type === "doctors") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border border-gray-100 rounded-2xl p-6 bg-white space-y-5">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-gray-200" />
              <div className="space-y-2 flex-1">
                <div className="h-5 bg-gray-200 rounded-md w-3/4" />
                <div className="h-4 bg-gray-100 rounded-md w-1/2" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-100 rounded-md w-full" />
              <div className="h-4 bg-gray-100 rounded-md w-5/6" />
            </div>
            <div className="flex gap-2 pt-2 border-t border-gray-50">
              <div className="h-10 bg-gray-200 rounded-lg flex-1" />
              <div className="h-10 bg-gray-100 rounded-lg w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="text-center py-12 px-6 flex flex-col items-center justify-center space-y-4">
      {/* Dynamic spinner */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-blue-100" />
        <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
      </div>
      <div className="max-w-md space-y-2">
        <h3 className="text-lg font-semibold text-gray-800 animate-pulse">Analyzing with PreCare...</h3>
        <p className="text-sm text-gray-500">
          Our specialized pregnancy AI engine is processing health metrics, blood indices, and pregnancy parameter biomarkers. This will take just a moment.
        </p>
      </div>
    </div>
  );
}
