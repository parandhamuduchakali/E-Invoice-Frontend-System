/** Inline stroke icons (24px grid) so the app needs no icon dependency. */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 22, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></Svg>
);
export const ReceiptIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h4" /></Svg>
);
export const UsersIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M17.5 14a6 6 0 0 1 4 5.5" /></Svg>
);
export const ScanIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M4 12h16" /></Svg>
);
export const FolderIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></Svg>
);
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></Svg>
);
export const UserIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Svg>
);
export const LogoutIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5" /><path d="M14 8l4 4-4 4M18 12H9" /></Svg>
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Svg>
);
export const PrintIcon = (p: IconProps) => (
  <Svg {...p}><path d="M7 8V4h10v4" /><rect x="4" y="8" width="16" height="9" rx="2" /><path d="M7 14h10v6H7z" /></Svg>
);
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></Svg>
);
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>
);
export const BuildingIcon = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3" /></Svg>
);
export const RupeeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M7 4h10M7 8h10M7 4c5 0 7 1.5 7 4s-2 4-7 4l7 8" /></Svg>
);
export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p}><path d="m5 12 5 5L20 7" /></Svg>
);
export const AlertIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4M12 17.5v.5" /></Svg>
);

/** Initials avatar used in the top bar and user menu. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}
