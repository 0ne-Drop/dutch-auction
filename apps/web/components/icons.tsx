type P = { size?: number };
const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const MenuIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const CloseIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
export const BackIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M15 6l-6 6 6 6" /></svg>
);
export const ChevronIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M9 6l6 6-6 6" /></svg>
);
