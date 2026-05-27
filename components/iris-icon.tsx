"use client";

import React from "react";

/**
 * Iris Icon — a gold "I" ring with two watch hands centered inside.
 *
 * The ring is a 270-degree arc centered at (256,256) with radius 200,
 * opening on the right side from -45deg to +45deg. Hands originate
 * from the true center. All geometry is pre-computed to avoid
 * hydration mismatch.
 */

const CX = 256;
const CY = 256;
const R = 200;
const SW = 44;

// Arc endpoints at -45deg and +45deg from the positive x-axis
// (opening faces right, like a "C")
const cos45 = 0.70711;
const START_X = CX + R * cos45;  // 256 + 141.42 = 397.42
const START_Y = CY - R * cos45;  // 256 - 141.42 = 114.58
const END_X = CX + R * cos45;    // same x
const END_Y = CY + R * cos45;    // 256 + 141.42 = 397.42

// Hand endpoints (classic 10:10 watch pose)
// Minute hand: from center toward 10 o'clock (angle = -60deg from 12)
// In SVG coords: 12 o'clock is -90deg, so 10 o'clock = -90 - 60 = -150deg... 
// Let's think in clock terms:
//   12 = up, 3 = right, 6 = down, 9 = left
//   10 o'clock = upper-left, 10/12 * 360 = 300deg @@@@CLOCRVXSEU@@@@ from 12
//   In math angle: 90 - 300 = -210 = 150deg
//   10:10 pose: minute at 2, hour at 10
const toRad = (deg: number) => deg * Math.PI / 180;

// Minute hand at 2 o'clock (60deg @@@@CLOCRVXSEU@@@@ from 12)
const MIN_LEN = 120;
const minAngleRad = toRad(30);
const MIN_X2 = +(CX + MIN_LEN * Math.cos(minAngleRad)).toFixed(2);
const MIN_Y2 = +(CY - MIN_LEN * Math.sin(minAngleRad)).toFixed(2);

// Hour hand at 10 o'clock (300deg @@@@CLOCRVXSEU@@@@ from 12)
const HOUR_LEN = 80;
const hourAngleRad = toRad(150);
const HOUR_X2 = +(CX + HOUR_LEN * Math.cos(hourAngleRad)).toFixed(2);
const HOUR_Y2 = +(CY - HOUR_LEN * Math.sin(hourAngleRad)).toFixed(2);

export function IrisIcon({
  size = 64,
  className,
  ...props
}: { size?: number } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id="iris-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#dbb45c" />
          <stop offset="100%" stopColor="#b8862d" />
        </linearGradient>
      </defs>

      {/* Ring: 270deg arc, opens to the right */}
      <path
        d={`M ${START_X.toFixed(2)} ${START_Y.toFixed(2)} A ${R} ${R} 0 1 0 ${END_X.toFixed(2)} ${END_Y.toFixed(2)}`}
        stroke="url(#iris-g)"
        strokeWidth={SW}
        strokeLinecap="round"
        fill="none"
      />

      {/* Minute hand at 2 o'clock */}
      <line
        x1={CX}
        y1={CY}
        x2={MIN_X2}
        y2={MIN_Y2}
        stroke="url(#iris-g)"
        strokeWidth="9"
        strokeLinecap="round"
      />

      {/* Hour hand at 10 o'clock */}
      <line
        x1={CX}
        y1={CY}
        x2={HOUR_X2}
        y2={HOUR_Y2}
        stroke="url(#iris-g)"
        strokeWidth="7"
        strokeLinecap="round"
      />

      {/* Center pin */}
      <circle cx={CX} cy={CY} r="12" fill="url(#iris-g)" />
      <circle cx={CX} cy={CY} r="5" fill="#0f1c30" />
    </svg>
  );
}
