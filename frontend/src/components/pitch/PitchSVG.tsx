// components/pitch/PitchSVG.tsx
import * as React from "react";
import { VB } from "../../lib/constants";

function PitchSVG({
    brandLeft = "YOUR BRAND",
    brandRight = "YOUR BRAND",
    className = "",
}: { brandLeft?: string; brandRight?: string; className?: string }) {

    const rectX = 393.051;
    const rectW = 630.839;
    const q1 = rectX + rectW * 0.25; // 550.76075
    const q3 = rectX + rectW * 0.75; // 866.18025

    return (
        <svg
            className={`w-full h-full block ${className}`}
            viewBox={`0 0 ${VB.W} ${VB.H}`}
            preserveAspectRatio="xMidYMin slice"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
        >
            {/* Main clipping for rounded pitch */}
            <g clipPath="url(#clip-pitch)">
                {/* Main Pitch */}
                <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M1.19101 776.316C-4.8639 764.189 12.8472 740.196 39.729 693.091C78.0063 626.019 269.918 261.641 361.09 87.8358C365.854 80.0518 369.848 73.3249 373.299 67.5135C392.636 34.9456 394.902 31.1284 419.954 31.1284H708.499V788.131C618.057 788.176 526.021 788.131 440.243 788.088C332.342 788.035 234.344 787.987 161.879 788.131C52.9415 788.131 8.71542 791.386 1.19101 776.316ZM1255.12 788.131C1364.06 788.131 1408.28 791.386 1415.81 776.316C1421.86 764.189 1404.15 740.196 1377.27 693.091C1338.99 626.019 1147.08 261.641 1055.91 87.8358C1051.14 80.0518 1047.15 73.3249 1043.7 67.5134C1024.36 34.9456 1022.1 31.1284 997.044 31.1284H708.499V788.131C798.941 788.176 890.977 788.131 976.755 788.088C1084.66 788.035 1182.65 787.987 1255.12 788.131Z"
                    fill="#007A3A"
                />

                {/* Pitch Stripes (masked to main shape) */}
                <mask id="mask-pitch" x="0" y="31" width="1417" height="758">
                    <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M1.19101 776.316C-4.8639 764.189 12.8472 740.196 39.729 693.091C78.0063 626.019 269.918 261.641 361.09 87.8358C365.854 80.0518 369.848 73.3249 373.299 67.5135C392.636 34.9456 394.902 31.1284 419.954 31.1284H708.499V788.131C618.057 788.176 526.021 788.131 440.243 788.088C332.342 788.035 234.344 787.987 161.879 788.131C52.9415 788.131 8.71542 791.386 1.19101 776.316ZM1255.12 788.131C1364.06 788.131 1408.28 791.386 1415.81 776.316C1421.86 764.189 1404.15 740.196 1377.27 693.091C1338.99 626.019 1147.08 261.641 1055.91 87.8358C1051.14 80.0518 1047.15 73.3249 1043.7 67.5134C1024.36 34.9456 1022.1 31.1284 997.044 31.1284H708.499V788.131C798.941 788.176 890.977 788.131 976.755 788.088C1084.66 788.035 1182.65 787.987 1255.12 788.131Z"
                        fill="#007A3A"
                    />
                </mask>
                <g mask="url(#mask-pitch)">
                    {/* Fewer stripes (duplicates removed) */}
                    <rect x="-8.5" y="512" width="1404" height="132" fill="#006E34" />
                    <rect x="100.99" y="350.257" width="1185.33" height="85.8784" fill="#006E34" />
                    <rect x="100.99" y="200.765" width="1185.33" height="63.6136" fill="#006E34" />
                    <rect x="100.99" y="73.5371" width="1185.33" height="63.6136" fill="#006E34" />
                </g>

                {/* Markings */}
                {/* Penalty Box D Arc */}
                <path
                    d="M600.887 137.365C622.772 152.47 663.011 162.596 709.03 162.596C755.048 162.596 795.288 152.47 817.173 137.365H600.887Z"
                    stroke="white"
                    strokeWidth="2.12045"
                />
                {/* Halfway Line */}
                <rect x="145.428" y="577.942" width="1122.352" height="3.827" fill="white" />
                {/* Center Dot */}
                <circle cx="708.133" cy="579.444" r="7.994" fill="white" />
                {/* Center Circle */}
                <circle cx="707.969" cy="584.036" r="92.77" stroke="white" strokeWidth="3.18068" />
                {/* Penalty Spot */}
                <circle cx="708.408" cy="115.567" r="3.409" fill="white" />
                {/* Penalty Box */}
                <path d="M492.763 137.211L532.065 57.5737H886.987L916.981 137.211H492.763Z" stroke="white" strokeWidth="2" />
                {/* 6 Yard Box */}
                <path d="M587.986 97.9828L602.193 57.5737H813.441L821.778 97.9828H587.986Z" stroke="white" strokeWidth="2" />
                {/* Touch/End Lines */}
                <path d="M32.6525 796.673L411.805 57.5737H1010.24L1376.95 796.673H32.6525Z" stroke="white" strokeWidth="2" />
                {/* Corner Arcs */}
                <path d="M406.865 67.3023C416.556 65.8862 424.739 62.527 429.731 57.6338H411.636L406.865 67.3023Z" stroke="white" strokeWidth="2.12045" />
                <path d="M1014.91 67.1758C1005.21 65.7598 996.572 62.527 991.581 57.6338H1010.13L1014.91 67.1758Z" stroke="white" strokeWidth="2.12045" />

                <g>
                    <rect x={rectX} y={0} width={rectW} height={45.59} rx={8.48} fill="url(#grad-banner)" />

                    <text
                        x={q1}
                        y={32}
                        textAnchor="middle"
                        fontWeight={800}
                        fontSize={18}
                        fill="#37003C"
                    >
                        {brandLeft}
                    </text>

                    <text
                        x={q3}
                        y={32}
                        textAnchor="middle"
                        fontWeight={800}
                        fontSize={18}
                        fill="#37003C"
                    >
                        {brandRight}
                    </text>
                </g>

                {/* Goal: keep outline & shadow; drop heavy netting paths for perf */}
                <rect x="645.387" y="11.3745" width="126.058" height="44.4535" fill="black" opacity="0.102" />
                <path d="M646.398 56.4909V11.4814H770.513V56.4909" stroke="white" strokeWidth="4.24091" />
            </g>

            <defs>
                <linearGradient id="grad-banner-fade" x1="393.051" y1="22.7949" x2="1023.89" y2="22.7949" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#00FF87" />
                    <stop offset="1" stopColor="#04F3EA" />
                </linearGradient>
                <linearGradient id="grad-banner" x1="393.051" y1="22.7949" x2="1023.89" y2="22.7949" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#02EFFF" />
                    <stop offset="1" stopColor="#627BFF" />
                </linearGradient>
                <clipPath id="clip-pitch">
                    <rect width="1417" height="788" rx="16.9636" fill="white" />
                </clipPath>
            </defs>
        </svg>
    );
}

export default React.memo(PitchSVG);