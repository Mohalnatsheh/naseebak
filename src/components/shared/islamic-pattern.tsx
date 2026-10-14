export function IslamicPatternBg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="islamicPattern"
          x="0"
          y="0"
          width="50"
          height="50"
          patternUnits="userSpaceOnUse"
        >
          <polygon
            points="25,2 31,10 40,10 35,18 38,27 30,25 25,32 20,25 12,27 15,18 10,10 19,10"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.5"
            opacity="0.15"
          />
          <polygon
            points="25,12 30,20 25,28 20,20"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.3"
            opacity="0.1"
          />
          <line x1="0" y1="25" x2="10" y2="25" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
          <line x1="40" y1="25" x2="50" y2="25" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
          <line x1="25" y1="0" x2="25" y2="2" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
          <line x1="25" y1="32" x2="25" y2="50" stroke="currentColor" strokeWidth="0.3" opacity="0.08" />
        </pattern>
      </defs>
      <rect width="200" height="200" fill="url(#islamicPattern)" />
    </svg>
  );
}

export function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-primary/[0.07]"
          style={{
            width: `${3 + (i % 4) * 2}px`,
            height: `${3 + (i % 4) * 2}px`,
            left: `${(i * 17 + 5) % 100}%`,
            top: `${(i * 23 + 10) % 100}%`,
            animation: `float-particle ${6 + (i % 5) * 2}s ease-in-out ${i * 0.4}s infinite alternate`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes float-particle {
          0% {
            transform: translateY(0px) translateX(0px) scale(1);
            opacity: 0.3;
          }
          50% {
            opacity: 0.7;
          }
          100% {
            transform: translateY(-30px) translateX(15px) scale(1.3);
            opacity: 0.2;
          }
        }
      `}</style>
    </div>
  );
}
