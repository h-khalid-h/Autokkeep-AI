export default function TaxLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: '18px',
            margin: '0 auto 16px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          AK
        </div>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '14px',
          }}
        >
          Analyzing your tax readiness…
        </p>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(0.95); }
          }
        `}</style>
      </div>
    </div>
  );
}
