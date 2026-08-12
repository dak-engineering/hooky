export function BrandMark() {
  return (
    <span aria-hidden="true" className="brand-mark">
      <svg fill="none" viewBox="0 0 28 28">
        <path
          d="M7 9.25V7.5A3.5 3.5 0 0 1 10.5 4h.25a3.5 3.5 0 0 1 3.5 3.5v5A3.5 3.5 0 0 0 17.75 16H21"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
        <path
          d="M21 18.75v1.75a3.5 3.5 0 0 1-3.5 3.5h-.25a3.5 3.5 0 0 1-3.5-3.5v-5A3.5 3.5 0 0 0 10.25 12H7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
        <circle cx="7" cy="12" fill="currentColor" r="1.5" />
        <circle cx="21" cy="16" fill="currentColor" r="1.5" />
      </svg>
    </span>
  );
}
