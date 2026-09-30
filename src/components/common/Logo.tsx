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
  const sizeClasses = {
    sm: 'text-lg tracking-wider',
    md: 'text-2xl tracking-widest',
    lg: 'text-3xl tracking-widest',
  };

  const markSizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const content = (
    <div className={cn('inline-flex items-center gap-2.5 select-none group', className)}>
      {/* Brand Monogram Mark */}
      <div
        className={cn(
          'flex items-center justify-center font-serif font-bold rounded bg-zinc-900 text-amber-500 shadow-sm border border-zinc-800 transition-transform duration-200 group-hover:scale-105',
          markSizeClasses[size]
        )}
      >
        <span>C</span>
      </div>

      <div className="flex flex-col">
        <span
          className={cn(
            'font-serif font-bold uppercase text-zinc-900 leading-none tracking-widest',
            sizeClasses[size]
          )}
        >
          CASA<span className="text-amber-600">IO</span>
        </span>
        {showSubtitle && (
          <span className="text-[10px] uppercase font-sans tracking-[0.25em] text-zinc-500 mt-0.5">
            Curated Living
          </span>
        )}
      </div>
    </div>
  );

  if (linkToHome) {
    return (
      <Link href="/" className="inline-flex focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded">
        {content}
      </Link>
    );
  }

  return content;
};
