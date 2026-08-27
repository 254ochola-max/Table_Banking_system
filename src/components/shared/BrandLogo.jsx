import React from "react";
import logoImg from "@/assets/logo.jpg";

export default function BrandLogo({ size = 80, className = "" }) {
  return (
    <img
      src={logoImg}
      alt="The Deborah's"
      style={{ width: size, height: size }}
      className={`object-contain rounded-2xl shadow-xs ${className}`}
    />  
  );
}