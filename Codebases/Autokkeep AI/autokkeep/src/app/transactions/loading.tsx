export default function TransactionsLoading() {
  return (
    <div style={{
      padding: '32px',
      maxWidth: '1200px',
      margin: '0 auto',
    }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{
          width: '220px',
          height: '32px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <div style={{
          width: '280px',
          height: '18px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '6px',
          marginTop: '8px',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      </div>

      {/* Search / filter bar skeleton */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
      }}>
        <div style={{
          flex: 1,
          height: '40px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.06)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <div style={{
          width: '100px',
          height: '40px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.06)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      </div>

      {/* Table skeleton — 8 rows: merchant, amount, category, status */}
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
          <div style={{ width: '160px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
          <div style={{ flex: 1 }} />
          <div style={{ width: '80px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
          <div style={{ width: '100px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
          <div style={{ width: '70px', height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }} />
        </div>

        {/* Table rows */}
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {/* Merchant */}
            <div style={{ width: `${120 + (i % 3) * 20}px`, height: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ flex: 1 }} />
            {/* Amount */}
            <div style={{ width: '80px', height: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            {/* Category */}
            <div style={{ width: '100px', height: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', animation: 'pulse 1.5s ease-in-out infinite' }} />
            {/* Status */}
            <div style={{ width: '70px', height: '24px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', animation: 'pulse 1.5s ease-in-out infinite' }} />
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
