// Hand-drawn station glyphs (stroke icons, 24×24). No icon fonts, no third-party assets.
const PATHS: Record<string, string> = {
  bridge: "M12 3l2.6 4.6 5.2-1-1 5.2L21 14l-4.6 1.4 1 5.2-5.2-1L12 21l-1.4-4.6-5.2 1 1-5.2L3 14l4.2-2.2-1-5.2 5.2 1z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  radar: "M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z M12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8z M12 12l6.4-6.4 M16.5 15.5h.01",
  shields: "M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z M9 12l2 2 4-4",
  identity: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5 M15 7h6 M15 11h6 M17 15h4",
  vault: "M4 5h16v14H4z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M12 9v-1 M15 12h1 M4 19v2 M20 19v2",
  comms: "M5 19a10 10 0 0 1 0-14 M19 5a10 10 0 0 1 0 14 M8 16a6 6 0 0 1 0-8 M16 8a6 6 0 0 1 0 8 M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  operator: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 13.5l1.6 1-2 3.4-1.8-.6a7 7 0 0 1-2 1.2L15 20.5h-4l-.4-2a7 7 0 0 1-2-1.2l-1.8.6-2-3.4 1.6-1a7 7 0 0 1 0-3l-1.6-1 2-3.4 1.8.6a7 7 0 0 1 2-1.2L11 3.5h4l.4 2a7 7 0 0 1 2 1.2l1.8-.6 2 3.4-1.6 1a7 7 0 0 1 0 3z",
  emergency: "M12 4l9 16H3z M12 10v4 M12 17h.01",
  logbook: "M6 3h11a2 2 0 0 1 2 2v16H8a2 2 0 0 1-2-2z M6 19a2 2 0 0 1 2-2h11 M10 7h5 M10 10h5",
  crew: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M2.5 19c.6-2.6 2.8-4 5.5-4s4.9 1.4 5.5 4 M13.5 15.3c.8-.2 1.6-.3 2.5-.3 2.7 0 4.9 1.4 5.5 4",
  academy: "M12 3l1.8 4.2 4.5.4-3.4 3 1 4.4L12 12.7 8.1 15l1-4.4-3.4-3 4.5-.4z M5 21c2-2 4.5-3 7-3s5 1 7 3",
  settings: "M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M10 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  scan: "M3 8V5a2 2 0 0 1 2-2h3 M16 3h3a2 2 0 0 1 2 2v3 M21 16v3a2 2 0 0 1-2 2h-3 M8 21H5a2 2 0 0 1-2-2v-3 M7 12h10",
  check: "M5 12l5 5L20 7",
  close: "M6 6l12 12 M18 6L6 18",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  back: "M19 12H5 M11 6l-6 6 6 6",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  file: "M14 3H6v18h12V7z M14 3v4h4",
  key: "M15 9a4 4 0 1 1-3.5 6L4 22l-2-2 1-1 2 1 1-2 2 1 1.5-1.5A4 4 0 0 1 15 9z",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1 M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  print: "M7 9V3h10v6 M7 17H4v-7h16v7h-3 M7 14h10v7H7z",
  play: "M7 4l13 8-13 8z",
  lock: "M6 11h12v10H6z M8 11V8a4 4 0 0 1 8 0v3",
  star: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5L3 9 M3 4v5h5 M4 13a8 8 0 0 0 14.6 4.5L21 15 M21 20v-5h-5",
  hint: "M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 19c.7-3 3-4.5 6-4.5s5.3 1.5 6 4.5 M16 4a3 3 0 0 1 0 6 M18 14.5c1.5.6 2.6 2 3 4.5",
  timer: "M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 9v4l2.5 2 M10 2h4",
  chat: "M4 5h16v11H9l-5 4z",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
};

export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] ?? PATHS.star} />
    </svg>
  );
}
