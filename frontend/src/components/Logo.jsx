export default function Logo({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <rect width="44" height="44" rx="12" fill="var(--accent)"/>
      <path d="M22 12C16.48 12 12 16.48 12 22s4.48 10 10 10h5v-2h-5c-3.87 0-7.42-3.02-8-6.84C13.36 18.63 17.26 14 22 14c4.18 0 7.63 3.07 8 7.14.13 1.48-.15 2.88-.73 4.12l1.46 1.46A9.94 9.94 0 0032 22c0-5.52-4.48-10-10-10zm0 14v-4h-2v4h2z" fill="white" fillOpacity=".9"/>
    </svg>
  );
}
