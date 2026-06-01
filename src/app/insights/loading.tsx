export default function InsightsLoading() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
    }}>
      {/* Header skeleton */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '64px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '12px',
      }}>
        <div style={{
          width: '120px',
          height: '24px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '6px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      </div>

      {/* Sidebar skeleton */}
      <div style={{
        width: '300px',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        background: 'var(--bg-secondary)',
        marginTop: '64px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
          paddingBottom: '16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: '120px',
            height: '20px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '6px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <div style={{
            width: '60px',
            height: '32px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            width: '100%',
            height: '48px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            animation: 'pulse 1.5s ease-in-out infinite',
            animationDelay: `${i * 0.1}s`,
          }} />
        ))}
      </div>

      {/* Chat area skeleton */}
      <div style={{
        flex: 1,
        marginTop: '64px',
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '40px',
      }}>
        {/* AI icon placeholder */}
        <div style={{
          width: '80px',
          height: '80px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '16px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        {/* Title placeholder */}
        <div style={{
          width: '240px',
          height: '28px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        {/* Subtitle placeholder */}
        <div style={{
          width: '380px',
          height: '18px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '6px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        {/* Suggestion cards skeleton */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          maxWidth: '560px',
          width: '100%',
          marginTop: '24px',
        }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              height: '56px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              animation: 'pulse 1.5s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }} />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
