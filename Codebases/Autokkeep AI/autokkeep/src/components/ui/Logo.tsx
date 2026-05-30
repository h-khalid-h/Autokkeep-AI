import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Logo({ size = 32, className = '', style = {} }: LogoProps) {
  // Apple squircle-like radius is ~22% of size
  const borderRadius = Math.round(size * 0.22);
  
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src="/images/logo.png"
      alt="Autokkeep Logo"
      width={size}
      height={size}
      className={className}
      style={{
        display: 'inline-block',
        borderRadius: `${borderRadius}px`,
        objectFit: 'contain',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}
