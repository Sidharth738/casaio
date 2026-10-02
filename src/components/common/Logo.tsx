import React from 'react';
import Image from 'next/image';
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
  const imageSizeClasses = {
    sm: 'h-9 w-24',
    md: 'h-10 w-24 sm:h-12 sm:w-[8.5rem]',
    lg: 'h-[4.5rem] w-52',
  };

  const content = (
    <span className={cn('inline-flex flex-col items-center select-none group', className)}>
      <Image
        src="/casaio-logo.png"
        alt="Casaio"
        width={564}
        height={442}
        draggable={false}
        className={cn(
          'object-cover object-center transition-transform duration-200 group-hover:scale-[1.02]',
          imageSizeClasses[size]
        )}
      />
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
