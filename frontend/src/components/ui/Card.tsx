import React from "react";

interface CardProps {
  className?: string;
  children: React.ReactNode;
}

export default function Card({ className = "", children }: CardProps) {
  return <div className={`rounded-2xl border border-border bg-card shadow-card ${className}`}>{children}</div>;
}