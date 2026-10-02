import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireServerRole } from '@/lib/firebase/server-auth';
import { revalidatePath } from 'next/cache';

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function POST(req: NextRequest) {
  try {
    if (!await requireServerRole(req, ['admin'])) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = slugify(typeof body.slug === 'string' ? body.slug : '');
    if (!name || !slug) {
      return NextResponse.json({ error: 'Category name and slug are required' }, { status: 400 });
    }
    const duplicate = await adminDb.collection('categories').where('slug', '==', slug).limit(1).get();
    if (!duplicate.empty) {
      return NextResponse.json({ error: 'A category with this slug already exists' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const ref = adminDb.collection('categories').doc();
    const category = {
      id: ref.id,
      name,
      slug,
      description: typeof body.description === 'string' ? body.description.trim() : '',
      ...(typeof body.imageUrl === 'string' && body.imageUrl.trim() ? { imageUrl: body.imageUrl.trim() } : {}),
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 1,
      isActive: body.isActive !== false,
      createdAt: now,
      updatedAt: now,
    };
    await ref.set(category);
    revalidatePath('/', 'page');
    revalidatePath('/categories', 'page');
    revalidatePath(`/categories/${slug}`);
    return NextResponse.json({ success: true, category }, { status: 201 });
  } catch (error: unknown) {
    console.error('Admin category creation error:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!await requireServerRole(req, ['admin'])) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const body = await req.json();
    const id = typeof body.id === 'string' ? body.id : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const slug = slugify(typeof body.slug === 'string' ? body.slug : '');
    if (!id || !name || !slug) {
      return NextResponse.json({ error: 'Category ID, name, and slug are required' }, { status: 400 });
    }
    const ref = adminDb.collection('categories').doc(id);
    const current = await ref.get();
    if (!current.exists) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    const duplicate = await adminDb.collection('categories').where('slug', '==', slug).limit(2).get();
    if (duplicate.docs.some((doc) => doc.id !== id)) {
      return NextResponse.json({ error: 'A category with this slug already exists' }, { status: 409 });
    }
    await ref.update({
      name,
      slug,
      description: typeof body.description === 'string' ? body.description.trim() : '',
      ...(typeof body.imageUrl === 'string' && body.imageUrl.trim() ? { imageUrl: body.imageUrl.trim() } : { imageUrl: null }),
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 1,
      isActive: body.isActive !== false,
      updatedAt: new Date().toISOString(),
    });
    revalidatePath('/', 'page');
    revalidatePath('/categories', 'page');
    revalidatePath(`/categories/${slug}`);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Admin category update error:', error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!await requireServerRole(req, ['admin'])) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
    const ref = adminDb.collection('categories').doc(id);
    const current = await ref.get();
    if (!current.exists) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
    await ref.delete();
    revalidatePath('/', 'page');
    revalidatePath('/categories', 'page');
    const slug = current.data()?.slug;
    if (typeof slug === 'string') revalidatePath(`/categories/${slug}`);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Admin category deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}
