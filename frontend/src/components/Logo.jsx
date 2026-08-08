export default function Logo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <rect width="44" height="44" rx="8" fill="var(--accent)" />
      <line x1="27" y1="12" x2="32.5" y2="4.5" stroke="white" strokeOpacity=".9" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="12" y="12" width="17" height="24" rx="3" fill="white" fillOpacity=".92" />
      <rect x="15.5" y="15.5" width="10" height="6" rx="1" fill="var(--accent)" />
      <line x1="15.5" y1="26" x2="25.5" y2="26" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="15.5" y1="29.5" x2="25.5" y2="29.5" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="20.5" cy="33" r="1.6" fill="var(--accent)" />
    </svg>
  );
}
