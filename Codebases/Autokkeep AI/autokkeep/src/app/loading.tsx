import Logo from '@/components/ui/Logo';

export default function Loading() {
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
            margin: '0 auto 16px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          <Logo size={48} />
        </div>
        <p
          style={{
            color: 'var(--text-secondary)',
            fontSize: '14px',
          }}
        >
          Loading...
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
