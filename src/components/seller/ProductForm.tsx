'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Trash2,
  Check,
  Star,
} from 'lucide-react';
import type { Product, Category, ProductImage } from '@/types';
import { getCategories } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface ProductFormProps {
  initialProduct?: Product | null;
  onSubmit: (productData: Partial<Product>) => Promise<void>;
  isLoading?: boolean;
  availableStatuses?: Product['status'][];
  cancelHref?: string;
}

export const ProductForm: React.FC<ProductFormProps> = ({
  initialProduct,
  onSubmit,
  isLoading = false,
  availableStatuses = ['active', 'draft'],
  cancelHref = '/seller/products',
}) => {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);

  // Form Fields
  const [title, setTitle] = useState(initialProduct?.title || '');
  const [slug, setSlug] = useState(initialProduct?.slug || '');
  const [shortDescription, setShortDescription] = useState(
    initialProduct?.shortDescription || ''
  );
  const [description, setDescription] = useState(initialProduct?.description || '');
  const [categoryId, setCategoryId] = useState(initialProduct?.categoryId || '');
  const [price, setPrice] = useState(initialProduct?.price?.toString() || '');
  const [compareAtPrice, setCompareAtPrice] = useState(
    initialProduct?.compareAtPrice?.toString() || ''
  );
  const [costPerItem, setCostPerItem] = useState(
    initialProduct?.costPerItem?.toString() || ''
  );
  const [sku, setSku] = useState(initialProduct?.sku || '');
  const [stock, setStock] = useState(initialProduct?.stock?.toString() || '10');
  const [lowStockThreshold, setLowStockThreshold] = useState(
    initialProduct?.lowStockThreshold?.toString() || '3'
  );
  const [tagsString, setTagsString] = useState(
    initialProduct?.tags?.join(', ') || ''
  );
  const [status, setStatus] = useState<Product['status']>(
    initialProduct?.status || 'active'
  );

  // Images state
  const [images, setImages] = useState<ProductImage[]>(
    initialProduct?.images || [
      {
        url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&q=80&w=1000',
        path: 'products/placeholder.jpg',
        altText: 'Primary image',
        isPrimary: true,
      },
    ]
  );
  const [newImageUrl, setNewImageUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Auto-generate slug from title if new product
  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!initialProduct) {
      setSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      );
    }
  };

  useEffect(() => {
    let isMounted = true;
    getCategories()
      .then((cats) => {
        if (isMounted) {
          setCategories(cats);
          if (!categoryId && cats.length > 0) {
            setCategoryId(cats[0].id);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [categoryId]);

  // Image manipulation
  const handleAddImage = () => {
    if (!newImageUrl.trim()) return;
    try {
      new URL(newImageUrl.trim());
      const newImg: ProductImage = {
        url: newImageUrl.trim(),
        path: `products/img-${Date.now()}.jpg`,
        altText: title || 'Product view',
        isPrimary: images.length === 0,
      };
      setImages([...images, newImg]);
      setNewImageUrl('');
    } catch {
      setErrors({ ...errors, image: 'Please enter a valid image URL' });
    }
  };

  const handleSetPrimaryImage = (index: number) => {
    setImages(
      images.map((img, i) => ({
        ...img,
        isPrimary: i === index,
      }))
    );
  };

  const handleRemoveImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    if (updated.length > 0 && !updated.some((img) => img.isPrimary)) {
      updated[0].isPrimary = true;
    }
    setImages(updated);
  };

  // Profit Margin Calculator
  const numPrice = parseFloat(price) || 0;
  const numCost = parseFloat(costPerItem) || 0;
  const marginPercent =
    numPrice > 0 && numCost > 0
      ? Math.round(((numPrice - numCost) / numPrice) * 100)
      : null;

  // Validation
  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!slug.trim()) newErrors.slug = 'Slug is required';
    if (!price || parseFloat(price) <= 0) newErrors.price = 'Valid retail price is required';
    if (!stock || parseInt(stock) < 0) newErrors.stock = 'Valid stock count is required';
    if (!categoryId) newErrors.categoryId = 'Category selection is required';
    if (images.length === 0) newErrors.images = 'At least one product image is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const selectedCat = categories.find((c) => c.id === categoryId);
    const tags = tagsString
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const payload: Partial<Product> = {
      title: title.trim(),
      slug: slug.trim(),
      shortDescription: shortDescription.trim(),
      description: description.trim(),
      categoryId,
      categorySlug: selectedCat?.slug || 'decor',
      price: parseFloat(price),
      compareAtPrice: compareAtPrice ? parseFloat(compareAtPrice) : undefined,
      costPerItem: costPerItem ? parseFloat(costPerItem) : undefined,
      sku: sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
      stock: parseInt(stock),
      lowStockThreshold: parseInt(lowStockThreshold) || 3,
      tags,
      images,
      status,
    };

    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* 1. General Information Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 sm:p-8 shadow-xs space-y-5">
        <h3 className="font-serif font-bold text-lg text-zinc-950 pb-3 border-b border-zinc-100">
          General Details
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Product Title *"
            placeholder="e.g. Scandi Fluted Oak Credenza"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            error={errors.title}
            required
          />
          <Input
            label="URL Handle (Slug) *"
            placeholder="scandi-fluted-oak-credenza"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            error={errors.slug}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1.5">
            Category *
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full h-10 px-3.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1.5">
            Short Summary
          </label>
          <input
            type="text"
            placeholder="Single-sentence summary of timber, craft, and dimensions."
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            className="w-full h-10 px-3.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1.5">
            Comprehensive Description & Craftsmanship
          </label>
          <textarea
            rows={5}
            placeholder="Detailed overview of materials, finish, joining techniques, dimensions, and maintenance..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full p-3.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900 leading-relaxed font-sans"
          />
        </div>
      </div>

      {/* 2. Media & Imagery Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div>
            <h3 className="font-serif font-bold text-lg text-zinc-950">Product Photography</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Add high-resolution URLs representing your atelier dropship inventory.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400">{images.length} images</span>
        </div>

        {errors.images && (
          <p className="text-xs text-rose-600 font-medium">{errors.images}</p>
        )}

        {/* Existing Images Thumbnails */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {images.map((img, idx) => (
            <div
              key={idx}
              className={`relative aspect-square rounded-xl overflow-hidden border bg-zinc-100 group ${
                img.isPrimary ? 'border-orange-600 ring-2 ring-orange-600/20' : 'border-zinc-200'
              }`}
            >
              <Image
                src={img.url}
                alt={img.altText || 'Thumbnail'}
                fill
                sizes="150px"
                className="object-cover"
              />

              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!img.isPrimary && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimaryImage(idx)}
                    className="p-1.5 rounded-full bg-white text-zinc-900 hover:bg-orange-100 hover:text-orange-800 transition-colors"
                    title="Set as Primary"
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveImage(idx)}
                  className="p-1.5 rounded-full bg-white text-rose-600 hover:bg-rose-50 transition-colors"
                  title="Remove Image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {img.isPrimary && (
                <div className="absolute top-2 left-2 bg-zinc-900/90 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded shadow-xs">
                  Primary
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add Image URL bar */}
        <div className="flex gap-2 pt-2">
          <Input
            placeholder="Paste public image URL (e.g. Unsplash, Cloudinary, AWS S3)"
            value={newImageUrl}
            onChange={(e) => setNewImageUrl(e.target.value)}
            className="text-xs"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddImage}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Image
          </Button>
        </div>
      </div>

      {/* 3. Pricing & Economics Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 sm:p-8 shadow-xs space-y-5">
        <h3 className="font-serif font-bold text-lg text-zinc-950 pb-3 border-b border-zinc-100">
          Pricing & Dropshipping Margin
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="Retail Price (₹) *"
            type="number"
            placeholder="24999"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={errors.price}
            required
          />
          <Input
            label="Compare-at Price (₹)"
            type="number"
            placeholder="32000"
            value={compareAtPrice}
            onChange={(e) => setCompareAtPrice(e.target.value)}
          />
          <Input
            label="Cost per Item (₹)"
            type="number"
            placeholder="16500"
            value={costPerItem}
            onChange={(e) => setCostPerItem(e.target.value)}
          />
        </div>

        {marginPercent !== null && (
          <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between text-xs">
            <span className="text-zinc-600 font-medium">Estimated Vendor Margin:</span>
            <span className="font-mono font-bold text-emerald-700">
              {marginPercent}% profit (₹{(numPrice - numCost).toLocaleString('en-IN')})
            </span>
          </div>
        )}
      </div>

      {/* 4. Inventory & Stock Card */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-6 sm:p-8 shadow-xs space-y-5">
        <h3 className="font-serif font-bold text-lg text-zinc-950 pb-3 border-b border-zinc-100">
          Inventory Tracking
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="SKU (Stock Keeping Unit)"
            placeholder="NOS-OAK-01"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          <Input
            label="Available Stock *"
            type="number"
            placeholder="14"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            error={errors.stock}
            required
          />
          <Input
            label="Low Stock Alert Threshold"
            type="number"
            placeholder="3"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
          />
        </div>

        <div>
          <Input
            label="Tags (comma-separated)"
            placeholder="oak, tambour, credenza, minimalist, scandinavian"
            value={tagsString}
            onChange={(e) => setTagsString(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-700 mb-1.5">
            Publication Status
          </label>
          <div className="flex flex-wrap items-center gap-4">
            {availableStatuses.map((availableStatus) => (
              <label key={availableStatus} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  value={availableStatus}
                  checked={status === availableStatus}
                  onChange={() => setStatus(availableStatus)}
                  className="text-zinc-950"
                />
                <span className="text-xs text-zinc-800 font-medium">
                  {availableStatus === 'active' ? 'Active (Visible in Storefront)' :
                    availableStatus === 'draft' ? 'Draft (Hidden in Catalog)' :
                      availableStatus === 'out_of_stock' ? 'Out of Stock' : 'Archived (Removed from Sale)'}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
        <Button
          type="button"
          variant="outline"
          size="md"
          onClick={() => router.push(cancelHref)}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="md"
          isLoading={isLoading}
          disabled={isLoading}
          rightIcon={!isLoading ? <Check className="w-4 h-4" /> : undefined}
        >
          {initialProduct ? 'Save Changes' : 'Publish Product'}
        </Button>
      </div>
    </form>
  );
};
