import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  linkToHome?: boolean;
}

export const Logo: React.FC<LogoProps> = ({
  className,
  size = 'md',
  linkToHome = true,
}) => {
  const imageSizeClasses = {
    sm: 'h-10 w-28',
    md: 'h-10 w-28 sm:h-14 sm:w-40',
    lg: 'h-20 w-56',
  };

  const imageOffsetClasses = {
    sm: '-top-7',
    md: '-top-7 sm:-top-10',
    lg: '-top-[3.75rem]',
  };

  const content = (
    <span className={cn('inline-flex flex-col items-center justify-center select-none group leading-none', className)}>
      <span className={cn('relative block overflow-hidden', imageSizeClasses[size])}>
        <Image
          src="/casaio-logo.jpeg"
          alt="Casaio"
          width={1254}
          height={1254}
          draggable={false}
          className={cn(
            // The supplied square artwork has generous whitespace. This
            // window shows the original mark without scaling the whitespace.
            'absolute left-0 max-w-none h-auto w-full transition-transform duration-200 group-hover:scale-[1.02]',
            imageOffsetClasses[size]
          )}
        />
      </span>
      <span
        className={cn(
          'mt-0.5 font-sans text-[6px] font-medium tracking-[0.08em] text-zinc-500 sm:text-[7px]',
          size === 'sm' && 'text-[5px]',
          size === 'lg' && 'text-[9px]'
        )}
      >
        Elevate Your Space
      </span>
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
