import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export const AnnouncementBar: React.FC = () => {
  return (
    <div className="bg-zinc-950 text-zinc-200 text-xs py-2 px-4 border-b border-zinc-900 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="hidden md:flex items-center gap-2 text-zinc-400">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Curated dropshipping collections directly from certified artisans.</span>
        </div>

        <div className="w-full md:w-auto text-center flex items-center justify-center gap-2">
          <span>
            Complimentary shipping on orders over <strong className="text-white font-semibold">₹1,499</strong>
          </span>
          <span className="hidden sm:inline text-zinc-600">|</span>
          <span className="hidden sm:inline text-amber-400 font-mono tracking-wider font-semibold">
            CODE: CASAIO10
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-4 text-zinc-400">
          <Link
            href="/seller/dashboard"
            className="hover:text-amber-400 transition-colors flex items-center gap-1 font-medium"
          >
            <span>Seller Hub</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
          <span className="text-zinc-700">|</span>
          <Link href="/track-order" className="hover:text-zinc-200 transition-colors">
            Track Order
          </Link>
        </div>
      </div>
    </div>
  );
};
