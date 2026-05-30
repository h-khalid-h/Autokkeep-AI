export default function PortfolioLoading() {
  return (
    <div style={{
      padding: '32px',
      maxWidth: '1200px',
      margin: '0 auto',
    }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{
          width: '180px',
          height: '32px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <div style={{
          width: '260px',
          height: '18px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '6px',
          marginTop: '8px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      </div>

      {/* 5 Summary cards skeleton */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{
            padding: '24px',
            borderRadius: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              width: '70px',
              height: '12px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '4px',
              marginBottom: '12px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            <div style={{
              width: '100px',
              height: '28px',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '6px',
              marginBottom: '8px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            <div style={{
              width: '60px',
              height: '14px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '4px',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
          </div>
        ))}
      </div>

      {/* Table skeleton — 6 rows */}
      <div style={{
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ width: '140px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: '80px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
          <div style={{ width: '80px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
          <div style={{ width: '90px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
        </div>

        {/* Table rows */}
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div style={{ width: `${100 + (i % 3) * 25}px`, height: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ flex: 1 }} />
            <div style={{ width: '80px', height: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: '80px', height: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ width: '90px', height: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        ))}
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
