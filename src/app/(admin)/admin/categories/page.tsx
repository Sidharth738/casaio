'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Check,
  Search,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { Category } from '@/types';
import { getCategories } from '@/lib/firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { getRenderableImageUrl } from '@/lib/utils';

export default function AdminCategoriesPage() {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isFetched, setIsFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Form modal state
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [sortOrder, setSortOrder] = useState('1');
  const [isActive, setIsActive] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = !isFetched && Boolean(user);

  const fetchCats = () => {
    getCategories()
      .then((data) => setCategories(data))
      .catch(() => {})
      .finally(() => setIsFetched(true));
  };

  useEffect(() => {
    if (!user) return;
    fetchCats();
  }, [user]);

  const handleOpenAdd = () => {
    setCurrentId(null);
    setName('');
    setSlug('');
    setDescription('');
    setImageUrl('');
    setSortOrder((categories.length + 1).toString());
    setIsActive(true);
    setError(null);
    setIsEditing(true);
  };

  const handleOpenEdit = (cat: Category) => {
    setCurrentId(cat.id);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || '');
    setImageUrl(cat.imageUrl || '');
    setSortOrder(cat.sortOrder.toString());
    setIsActive(cat.isActive);
    setError(null);
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) {
      setError('Name and slug are required.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      const response = await fetch('/api/admin/categories', {
        method: currentId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentId,
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim(),
          imageUrl: imageUrl.trim(),
          sortOrder: Number.parseInt(sortOrder, 10) || 1,
          isActive,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save category');

      setIsEditing(false);
      fetchCats();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save category';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      const response = await fetch(`/api/admin/categories?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete category');
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch {
      alert('Failed to delete category.');
    }
  };

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-200/80 gap-4">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-zinc-950">
            Category Taxonomy
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Configure product departments, navigation taxonomies, and editorial banners.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={handleOpenAdd}
        >
          Add New Category
        </Button>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl border border-zinc-200 p-3 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search categories by name or slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* Inline Form */}
      {isEditing && (
        <form
          onSubmit={handleSave}
          className="bg-white rounded-2xl border border-zinc-900/10 p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
            <h3 className="font-serif font-bold text-base text-zinc-950">
              {currentId ? 'Edit Category' : 'Create Category'}
            </h3>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="text-xs text-zinc-400 hover:text-zinc-700"
            >
              Cancel
            </button>
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Category Name *"
              placeholder="e.g. Sculptural Lighting"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!currentId) {
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
                }
              }}
              required
            />
            <Input
              label="URL Slug *"
              placeholder="sculptural-lighting"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Editorial Image URL"
              placeholder="https://images.unsplash.com/..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <Input
              label="Sort Sequence Order"
              type="number"
              placeholder="1"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5">
              Description
            </label>
            <input
              type="text"
              placeholder="Short artisanal narrative for collection heading..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-10 px-3.5 text-xs border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-zinc-950"
              />
              <span className="text-xs font-medium text-zinc-800">
                Visible and active in storefront navigation
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSaving}
              rightIcon={<Check className="w-3.5 h-3.5" />}
            >
              {currentId ? 'Update Category' : 'Create Category'}
            </Button>
          </div>
        </form>
      )}

      {/* Categories Grid */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-orange-600" />
          <p className="text-xs">Loading category list...</p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-12 text-center space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-bold text-zinc-900">No Categories Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mt-1">
              Add your first department to organize furnishings on the platform.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCategories.map((cat) => (
            <div
              key={cat.id}
              className="bg-white rounded-2xl border border-zinc-200/80 overflow-hidden shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="relative aspect-16/9 bg-zinc-100">
                  {getRenderableImageUrl(cat.imageUrl) ? (
                    <Image
                      src={getRenderableImageUrl(cat.imageUrl)!}
                      alt={cat.name}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-300">
                      <Layers className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute top-2.5 right-2.5">
                    <Badge variant={cat.isActive ? 'secondary' : 'default'} size="sm">
                      {cat.isActive ? 'Active' : 'Hidden'}
                    </Badge>
                  </div>
                </div>

                <div className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-serif font-bold text-base text-zinc-950">{cat.name}</h3>
                    <span className="text-[10px] font-mono text-zinc-400">Order: {cat.sortOrder}</span>
                  </div>
                  <p className="font-mono text-xs text-zinc-400">/{cat.slug}</p>
                  {cat.description && (
                    <p className="text-xs text-zinc-600 line-clamp-2 pt-1">{cat.description}</p>
                  )}
                </div>
              </div>

              <div className="p-4 pt-3 border-t border-zinc-100 flex items-center justify-end gap-2 text-xs">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5"
                  onClick={() => handleOpenEdit(cat)}
                  leftIcon={<Edit2 className="w-3.5 h-3.5" />}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-rose-600 hover:bg-rose-50"
                  onClick={() => handleDelete(cat.id)}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
