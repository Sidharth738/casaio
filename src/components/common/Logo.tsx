import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
  linkToHome?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  className,
  size = 'md',
  showSubtitle = false,
  linkToHome = true,
}) => {
  const logoSizeClasses = {
    sm: 'text-3xl',
    md: 'text-4xl sm:text-5xl',
    lg: 'text-6xl',
  };

  const content = (
    <span className={cn('inline-flex flex-col items-center select-none group', className)}>
      <span
        role="img"
        aria-label="Casaio"
        className={cn(
          'font-serif font-bold italic leading-none tracking-[-0.08em] transition-transform duration-200 group-hover:scale-[1.02]',
          logoSizeClasses[size]
        )}
      >
        <span className="text-orange-600">Casa</span><span className="text-zinc-600">io</span>
      </span>
      {showSubtitle && (
        <span className="-mt-0.5 text-[9px] uppercase font-sans tracking-[0.25em] text-zinc-500">
          Curated Living
        </span>
      )}
    </span>
  );

  if (linkToHome) {
    return (
      <Link href="/" aria-label="Casaio home" className="inline-flex rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
        {content}
      </Link>
    );
  }

  return content;
};
