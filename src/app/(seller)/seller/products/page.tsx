'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  ExternalLink,
  AlertTriangle,
  ShoppingBag,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Product } from '@/types';
import { getSellerProducts, updateProductStock } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';

export default function SellerProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft' | 'low_stock'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    getSellerProducts(user.uid)
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

  const handleStockChange = async (productId: string, newStock: number) => {
    try {
      await updateProductStock(productId, newStock);
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                stock: newStock,
                status: newStock <= 0 ? 'out_of_stock' : p.status,
              }
            : p
        )
      );
    } catch {
      alert('Failed to update stock.');
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product from your catalog?')) return;
    if (!user) return;

    try {
      setDeletingId(productId);
      const res = await fetch(`/api/seller/products/${productId}?sellerId=${user.uid}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== productId));
      } else {
        alert('Failed to delete product.');
      }
    } catch {
      alert('An error occurred while deleting.');
    } finally {
      setDeletingId(null);
    }
  };

  // Filtering
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.categorySlug.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return p.status === 'active';
    if (statusFilter === 'draft') return p.status === 'draft';
    if (statusFilter === 'low_stock') return p.stock <= p.lowStockThreshold;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            Catalog & Inventory
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Manage your dropshipping catalog, pricing, margins, and live warehouse inventory.
          </p>
        </div>

        <Link href="/seller/products/new">
          <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />}>
            Add New Product
          </Button>
        </Link>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white rounded-xl border border-zinc-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, SKU, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {(['all', 'active', 'draft', 'low_stock'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg font-medium capitalize whitespace-nowrap transition-colors ${
                statusFilter === filter
                  ? 'bg-zinc-900 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              {filter.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table or State */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-amber-600" />
          <p className="text-xs">Loading atelier catalog...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <Package className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Products Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              {searchTerm || statusFilter !== 'all'
                ? 'No items matched your current filter criteria. Try resetting your search.'
                : 'Start listing your handcrafted furniture and decor pieces to commence selling on Casaio.'}
            </p>
          </div>
          {!searchTerm && statusFilter === 'all' && (
            <Link href="/seller/products/new" className="inline-block pt-2">
              <Button variant="primary" size="md" leftIcon={<Plus className="w-4 h-4" />}>
                Create Your First Product
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-50/70 border-b border-zinc-100 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4 sm:px-6">Product</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Price</th>
                  <th className="py-3.5 px-4">Stock</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Sales</th>
                  <th className="py-3.5 px-4 text-right sm:pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {filteredProducts.map((p) => {
                  const isLow = p.stock <= p.lowStockThreshold;
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

                      {/* Category */}
                      <td className="py-4 px-4 capitalize text-zinc-600">
                        {p.categorySlug.replace(/-/g, ' ')}
                      </td>

                      {/* Price */}
                      <td className="py-4 px-4">
                        <span className="font-mono font-bold text-zinc-950">
                          {formatCurrency(p.price)}
                        </span>
                        {p.compareAtPrice && (
                          <span className="block font-mono text-[10px] text-zinc-400 line-through">
                            {formatCurrency(p.compareAtPrice)}
                          </span>
                        )}
                      </td>

                      {/* Stock with quick modifier */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={p.stock}
                            onChange={(e) =>
                              handleStockChange(p.id, parseInt(e.target.value) || 0)
                            }
                            className="w-16 h-7 px-2 border border-zinc-200 rounded font-mono text-xs text-center focus:border-zinc-900 focus:outline-none"
                          />
                          {isLow && (
                            <span
                              title={`Low stock alert! Below threshold of ${p.lowStockThreshold}`}
                              className="text-amber-600"
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <Badge
                          variant={
                            p.status === 'active'
                              ? 'accent'
                              : p.status === 'draft'
                              ? 'secondary'
                              : 'danger'
                          }
                          size="sm"
                          className="capitalize"
                        >
                          {p.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>

                      {/* Sales */}
                      <td className="py-4 px-4 font-mono font-medium text-zinc-900">
                        {p.salesCount || 0}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 sm:pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/seller/products/${p.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-zinc-600 hover:text-zinc-950"
                              title="Edit product"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                          </Link>

                          <Link href={`/products/${p.slug}`} target="_blank">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2.5 text-zinc-400 hover:text-zinc-900"
                              title="View in storefront"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => handleDelete(p.id)}
                            disabled={deletingId === p.id}
                            title="Delete product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
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
