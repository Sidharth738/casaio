'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Package,
  Search,
  Star,
  ExternalLink,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Product } from '@/types';
import { getAllProductsAdmin } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/utils';

export default function AdminProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'featured'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    getAllProductsAdmin()
      .then((data) => {
        if (isMounted) setProducts(data);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsFetched(true);
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleToggleFeatured = async (product: Product) => {
    try {
      setActionLoading(product.id);
      const nextFeatured = !product.isFeatured;
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: nextFeatured }),
      });

      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === product.id ? { ...p, isFeatured: nextFeatured } : p))
        );
      } else {
        alert('Failed to update product');
      }
    } catch {
      alert('Error updating product');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStatusChange = async (productId: string, newStatus: Product['status']) => {
    try {
      setActionLoading(productId);
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setProducts((prev) =>
          prev.map((p) => (p.id === productId ? { ...p, status: newStatus } : p))
        );
      } else {
        alert('Failed to update status');
      }
    } catch {
      alert('Error updating status');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sellerStoreName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'active') return p.status === 'active';
    if (statusFilter === 'draft') return p.status === 'draft';
    if (statusFilter === 'featured') return p.isFeatured;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            Global Product Catalog
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Platform-wide merchandising oversight, featured dropship curation, and publication controls.
          </p>
        </div>

        <div className="text-xs font-mono text-zinc-400">
          {products.length} products listed
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-zinc-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, seller, or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {(['all', 'active', 'draft', 'featured'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize whitespace-nowrap transition-colors ${
                statusFilter === filter
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-600" />
          <p className="text-xs">Loading global inventory...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Products Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              No products match your current search and filter settings.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50/70 border-b border-zinc-100 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Product</th>
                  <th className="py-3.5 px-4">Artisan Atelier</th>
                  <th className="py-3.5 px-4">Retail Price</th>
                  <th className="py-3.5 px-4">Warehouse Stock</th>
                  <th className="py-3.5 px-4">Curated Featured</th>
                  <th className="py-3.5 px-4">Catalog Status</th>
                  <th className="py-3.5 px-4 text-right sm:pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredProducts.map((p) => {
                  const thumb = p.images?.[0]?.url;

                  return (
                    <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                      {/* Product details */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="relative w-12 h-12 rounded-lg bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                            {thumb ? (
                              <Image
                                src={thumb}
                                alt={p.title}
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-300">
                                <ShoppingBag className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 max-w-xs">
                            <Link
                              href={`/products/${p.slug}`}
                              target="_blank"
                              className="font-medium text-zinc-900 hover:text-amber-700 transition-colors truncate block"
                            >
                              {p.title}
                            </Link>
                            <span className="font-mono text-[11px] text-zinc-400 block mt-0.5">
                              {p.sku}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Seller */}
                      <td className="py-4 px-4 font-medium text-zinc-800">
                        {p.sellerStoreName}
                      </td>

                      {/* Price */}
                      <td className="py-4 px-4 font-mono font-bold text-zinc-950">
                        {formatCurrency(p.price)}
                      </td>

                      {/* Stock */}
                      <td className="py-4 px-4 font-mono font-medium">
                        {p.stock} units
                      </td>

                      {/* Featured Toggle */}
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleFeatured(p)}
                          disabled={actionLoading === p.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                            p.isFeatured
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                          }`}
                        >
                          <Star className={`w-3 h-3 ${p.isFeatured ? 'fill-amber-600 text-amber-600' : ''}`} />
                          <span>{p.isFeatured ? 'Featured' : 'Standard'}</span>
                        </button>
                      </td>

                      {/* Status select */}
                      <td className="py-4 px-4">
                        <select
                          value={p.status}
                          onChange={(e) =>
                            handleStatusChange(p.id, e.target.value as Product['status'])
                          }
                          disabled={actionLoading === p.id}
                          className="h-7 px-2 text-xs border border-zinc-200 rounded font-medium focus:outline-none focus:border-zinc-900 bg-white"
                        >
                          <option value="active">Active</option>
                          <option value="draft">Draft</option>
                          <option value="out_of_stock">Out of Stock</option>
                          <option value="archived">Archived</option>
                        </select>
                      </td>

                      {/* Action */}
                      <td className="py-4 px-4 sm:pr-6 text-right">
                        <Link href={`/products/${p.slug}`} target="_blank">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-zinc-500 hover:text-zinc-950"
                            title="Preview on storefront"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
