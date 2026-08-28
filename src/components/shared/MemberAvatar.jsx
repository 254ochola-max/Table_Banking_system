import React, { useState, useEffect } from "react";
import { User } from "lucide-react";

/**
 * MemberAvatar Component
 * Displays the member's profile photo with graceful fallback to initial or User icon.
 *
 * @param {string} photoUrl - Profile photo URL or DataURL
 * @param {string} name - Member full name
 * @param {string|number} size - "xs" (24px), "sm" (32px), "md" (40px), "lg" (48px), "xl" (64px), "2xl" (88px) or pixel number
 * @param {string} className - Additional CSS classes
 * @param {boolean} ring - Whether to show a decorative border ring
 */
export default function MemberAvatar({
  photoUrl,
  name = "",
  size = "md",
  className = "",
  ring = false,
  role = "",
}) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [photoUrl]);

  const sizeMap = {
    xs: "w-6 h-6 text-[10px]",
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-xl",
    "2xl": "w-20 h-20 sm:w-22 sm:h-22 text-2xl sm:text-3xl",
  };

  const dimensionClass = typeof size === "string" ? (sizeMap[size] || sizeMap.md) : `w-[${size}px] h-[${size}px] text-sm`;

  const initial = name?.trim() ? name.trim().charAt(0).toUpperCase() : "";

  // Dynamic gradient based on member name to make initial avatars look vibrant and distinct
  const getGradient = (str) => {
    const gradients = [
      "from-fuchsia-600 to-pink-500",
      "from-purple-600 to-indigo-500",
      "from-pink-500 to-rose-500",
      "from-violet-600 to-fuchsia-600",
      "from-fuchsia-700 to-amber-500",
    ];
    if (!str) return gradients[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash += str.charCodeAt(i);
    return gradients[hash % gradients.length];
  };

  const hasPhoto = photoUrl && !imageError;

  return (
    <div
      className={`relative inline-flex items-center justify-center rounded-full overflow-hidden flex-shrink-0 select-none ${dimensionClass} ${
        ring ? "p-0.5 bg-gradient-to-tr from-fuchsia-400 via-pink-300 to-amber-300 shadow-sm" : ""
      } ${className}`}
    >
      <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center ${
        hasPhoto ? "bg-gray-100" : `bg-gradient-to-br ${getGradient(name)} text-white font-bold`
      }`}>
        {hasPhoto ? (
          <img
            src={photoUrl}
            alt={name || "Member Profile"}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : initial ? (
          <span>{initial}</span>
        ) : (
          <User className="w-1/2 h-1/2 text-white/90" />
        )}
      </div>
    </div>
  );
}
