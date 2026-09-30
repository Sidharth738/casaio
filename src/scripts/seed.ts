/**
 * Casaio Database Seeding Script
 * 
 * Populates Firestore with:
 * - 6 Core curated Categories
 * - 4 Verified Dropship Sellers
 * - 8 High-fidelity artisan products with variants, images, specifications, and stock
 * 
 * Usage:
 *   npx tsx src/scripts/seed.ts
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env.local if present
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  'casaio-app';

if (getApps().length === 0) {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  if (clientEmail && privateKey) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } else {
    initializeApp({ projectId });
  }
}

const db = getFirestore();

// --- 1. CATEGORIES ---
const categories = [
  {
    id: 'cat-living-room',
    name: 'Living Room',
    slug: 'living-room',
    description: 'Curated architectural credenzas, marble tables, and sculptural seating.',
    imageUrl: 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?auto=format&fit=crop&q=80&w=800',
    parentId: null,
    isActive: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-lighting',
    name: 'Architectural Lighting',
    slug: 'lighting',
    description: 'Hand-blown glass pendants, sculptural sconces, and ambient floor luminaires.',
    imageUrl: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=800',
    parentId: null,
    isActive: true,
    sortOrder: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-decor',
    name: 'Artisan Decor & Vases',
    slug: 'decor',
    description: 'Hand-thrown stoneware ceramics, travertine vessels, and decorative centerpieces.',
    imageUrl: 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&q=80&w=800',
    parentId: null,
    isActive: true,
    sortOrder: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-kitchen',
    name: 'Dining & Kitchenware',
    slug: 'kitchen',
    description: 'Organic stoneware dinner sets, cast-iron accents, and walnut serveware.',
    imageUrl: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&q=80&w=800',
    parentId: null,
    isActive: true,
    sortOrder: 4,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-bedroom',
    name: 'Bedroom Sanctuary',
    slug: 'bedroom',
    description: 'Fluted headboards, organic linen bedding, and minimalist nightstands.',
    imageUrl: 'https://images.unsplash.com/photo-1540518614846-7ede433c4ef7?auto=format&fit=crop&q=80&w=800',
    parentId: null,
    isActive: true,
    sortOrder: 5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'cat-workspace',
    name: 'Minimalist Workspace',
    slug: 'workspace',
    description: 'Solid wood desks, ergonomic artisan leather chairs, and executive organizers.',
    imageUrl: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&q=80&w=800',
    parentId: null,
    isActive: true,
    sortOrder: 6,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// --- 2. SELLERS ---
const sellers = [
  {
    uid: 'seller-nordic-oak',
    storeName: 'Nordic Oak Studios',
    storeSlug: 'nordic-oak-studios',
    storeDescription: 'Master woodworkers crafting sustainable FSC-certified oak furnishings in Scandinavia and Jaipur.',
    logoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
    status: 'approved',
    businessEmail: 'contact@nordicoak.example',
    phone: '+919876543210',
    address: {
      street: '42 Timber Craft Lane',
      city: 'Jaipur',
      state: 'Rajasthan',
      country: 'India',
      postalCode: '302001',
    },
    commissionRatePercent: 12,
    payoutDetails: {
      accountHolderName: 'Nordic Oak Studios LLP',
      accountNumber: 'XXXXXX1234',
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank',
    },
    rating: 4.9,
    totalSales: 1420000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    uid: 'seller-lumiere',
    storeName: 'Lumière Atelier',
    storeSlug: 'lumiere-atelier',
    storeDescription: 'Handmade architectural luminaires blending mouth-blown borosilicate glass and brushed brass.',
    logoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
    status: 'approved',
    businessEmail: 'support@lumiereatelier.example',
    phone: '+919876543211',
    address: {
      street: '18 Glassmakers Way',
      city: 'Firozabad',
      state: 'Uttar Pradesh',
      country: 'India',
      postalCode: '283203',
    },
    commissionRatePercent: 10,
    rating: 4.8,
    totalSales: 890000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    uid: 'seller-stoneworks',
    storeName: 'Stoneworks Heritage',
    storeSlug: 'stoneworks-heritage',
    storeDescription: 'Solid Makrana and Italian travertine stonemasons carving timeless sculptural home accents.',
    logoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200',
    status: 'approved',
    businessEmail: 'hello@stoneworksheritage.example',
    phone: '+919876543212',
    address: {
      street: '9 Quarry Road',
      city: 'Udaipur',
      state: 'Rajasthan',
      country: 'India',
      postalCode: '313001',
    },
    commissionRatePercent: 12,
    rating: 5.0,
    totalSales: 2150000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    uid: 'seller-clay-kiln',
    storeName: 'Clay & Kiln Collective',
    storeSlug: 'clay-and-kiln',
    storeDescription: 'Studio pottery collective creating small-batch matte glazed dinnerware and organic stoneware vessels.',
    logoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
    status: 'approved',
    businessEmail: 'orders@clayandkiln.example',
    phone: '+919876543213',
    address: {
      street: '7 Potter Colony',
      city: 'Khurja',
      state: 'Uttar Pradesh',
      country: 'India',
      postalCode: '203131',
    },
    commissionRatePercent: 8,
    rating: 4.7,
    totalSales: 640000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// --- 3. PRODUCTS ---
const products = [
  {
    id: 'prod-scandi-fluted-oak-credenza',
    sellerId: 'seller-nordic-oak',
    sellerStoreName: 'Nordic Oak Studios',
    title: 'Scandi Fluted Oak Credenza',
    slug: 'scandi-fluted-oak-credenza',
    shortDescription: 'Solid American white oak side cabinet featuring precision-milled tambour fluting and soft-close German hardware.',
    description: `Designed with restrained Scandinavian geometry, the Scandi Fluted Oak Credenza represents modern artisan millwork at its highest caliber. 

Each slat is individually machined from sustainably sourced American White Oak, selected for uniform grain and resilience. Behind the seamless sliding doors, dual height-adjustable shelves provide ample storage for audio components, fine tableware, or books, with built-in cable management apertures.

Finished with an ultra-matte Danish hardwax oil that preserves the raw tactile warmth of natural wood while offering water and stain protection. Dispatched in custom reinforced timber packaging directly from our studio.`,
    price: 24999,
    compareAtPrice: 32000,
    costPerItem: 16500,
    sku: 'NOS-OAK-CRD-01',
    stock: 14,
    lowStockThreshold: 3,
    categoryId: 'cat-living-room',
    categorySlug: 'living-room',
    tags: ['credenza', 'oak', 'scandinavian', 'minimalist', 'living-room'],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-1/img-1.jpg',
        altText: 'Front angle of Scandi Fluted Oak Credenza',
        isPrimary: true,
      },
      {
        url: 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-1/img-2.jpg',
        altText: 'Detail of fluted tambour texture',
        isPrimary: false,
      },
    ],
    hasVariants: true,
    variants: [
      {
        sku: 'NOS-OAK-CRD-NAT',
        title: 'Natural White Oak',
        price: 24999,
        compareAtPrice: 32000,
        stock: 9,
        attributes: { finish: 'Natural White Oak', width: '160cm' },
      },
      {
        sku: 'NOS-OAK-CRD-SMK',
        title: 'Smoked Charcoal Oak',
        price: 26999,
        compareAtPrice: 34500,
        stock: 5,
        attributes: { finish: 'Smoked Charcoal Oak', width: '160cm' },
      },
    ],
    status: 'active',
    ratings: { average: 4.9, count: 38 },
    salesCount: 84,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-komorebi-ribbed-glass-pendant',
    sellerId: 'seller-lumiere',
    sellerStoreName: 'Lumière Atelier',
    title: 'Komorebi Ribbed Glass Pendant Lamp',
    slug: 'komorebi-ribbed-glass-pendant',
    shortDescription: 'Mouth-blown fluted borosilicate glass shade with unlacquered aged brass hardware and woven silk cord.',
    description: `Named after the Japanese concept of sunlight filtering through leaves, the Komorebi pendant casts delicate refractive ambient ripples across walls and ceilings.

Crafted by heritage glassblowers using thermal shock-resistant borosilicate glass, every pendant features subtle individual rippling that denotes handcraft. Paired with CNC-machined solid brass fittings and a 2-meter braided textile cord for flexible drop height. Compatible with standard E27 warm Edison and smart dimmable bulbs.`,
    price: 4499,
    compareAtPrice: 5999,
    costPerItem: 2200,
    sku: 'LUM-KOM-GLS-01',
    stock: 28,
    lowStockThreshold: 5,
    categoryId: 'cat-lighting',
    categorySlug: 'lighting',
    tags: ['pendant', 'lighting', 'brass', 'blown-glass', 'dining'],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-2/img-1.jpg',
        altText: 'Komorebi Pendant hanging over dining space',
        isPrimary: true,
      },
      {
        url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-2/img-2.jpg',
        altText: 'Close up of ribbed brass fixture',
        isPrimary: false,
      },
    ],
    hasVariants: true,
    variants: [
      {
        sku: 'LUM-KOM-BRS',
        title: 'Aged Brushed Brass',
        price: 4499,
        compareAtPrice: 5999,
        stock: 18,
        attributes: { metal: 'Aged Brass', diameter: '24cm' },
      },
      {
        sku: 'LUM-KOM-BLK',
        title: 'Matte Gunmetal Black',
        price: 4499,
        compareAtPrice: 5999,
        stock: 10,
        attributes: { metal: 'Matte Gunmetal', diameter: '24cm' },
      },
    ],
    status: 'active',
    ratings: { average: 4.8, count: 52 },
    salesCount: 165,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-travertine-plinth-coffee-table',
    sellerId: 'seller-stoneworks',
    sellerStoreName: 'Stoneworks Heritage',
    title: 'Minimalist Travertine Marble Coffee Table',
    slug: 'minimalist-travertine-coffee-table',
    shortDescription: 'Monolithic low-profile coffee table hand-carved from unfilled natural beige travertine with bullnose chamfering.',
    description: `A study in organic permanence, our Travertine Plinth Coffee Table is sculpted from selected natural Roman travertine slabs. The honed, unpolished matte surface celebrates open sediment pockets, natural veins, and geological warmth.

Every slab is sealed with an invisible penetrating fluoropolymer sealer to guard against liquid absorption without creating artificial plastic sheen. Hand-beveled bullnose edges ensure safe domestic usability without compromising geometric rigor.`,
    price: 18500,
    compareAtPrice: 22000,
    costPerItem: 11000,
    sku: 'STN-TRV-TBL-01',
    stock: 8,
    lowStockThreshold: 2,
    categoryId: 'cat-living-room',
    categorySlug: 'living-room',
    tags: ['coffee-table', 'travertine', 'marble', 'sculptural', 'stone'],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-3/img-1.jpg',
        altText: 'Travertine Coffee table in sunlit minimalist lounge',
        isPrimary: true,
      },
    ],
    hasVariants: false,
    status: 'active',
    ratings: { average: 5.0, count: 19 },
    salesCount: 42,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-organic-stoneware-dinnerware-set',
    sellerId: 'seller-clay-kiln',
    sellerStoreName: 'Clay & Kiln Collective',
    title: 'Organic Stoneware Dinnerware Set (16 Pc)',
    slug: 'organic-stoneware-dinnerware-set',
    shortDescription: 'Service for four including dinner plates, salad plates, breakfast bowls, and mugs in reactive oat glaze.',
    description: `Hand-thrown from dense iron-rich stoneware clay and fired at 1280°C, this 16-piece service offers chip-resistant durability suited for both daily feasts and intimate dinner parties.

Featuring an organic, intentionally undulating rim and satin matte reactive glaze that pools into delicate toast-colored speckles. Microwave, dishwasher, and oven safe up to 220°C. Contains 4 Dinner Plates (27cm), 4 Salad Plates (21cm), 4 All-Purpose Bowls (16cm), and 4 Mugs (350ml).`,
    price: 6890,
    compareAtPrice: 8500,
    costPerItem: 3800,
    sku: 'CKC-STN-DN-16',
    stock: 22,
    lowStockThreshold: 4,
    categoryId: 'cat-kitchen',
    categorySlug: 'kitchen',
    tags: ['stoneware', 'ceramics', 'dinnerware', 'handmade', 'kitchen'],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1614707267537-b85aaf00c4b7?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-4/img-1.jpg',
        altText: 'Stacked organic stoneware dinner plates',
        isPrimary: true,
      },
    ],
    hasVariants: true,
    variants: [
      {
        sku: 'CKC-STN-DN-OAT',
        title: 'Warm Oat Satin',
        price: 6890,
        compareAtPrice: 8500,
        stock: 14,
        attributes: { glaze: 'Oat Satin' },
      },
      {
        sku: 'CKC-STN-DN-SLT',
        title: 'Matte Slate Charcoal',
        price: 7190,
        compareAtPrice: 8900,
        stock: 8,
        attributes: { glaze: 'Slate Charcoal' },
      },
    ],
    status: 'active',
    ratings: { average: 4.7, count: 44 },
    salesCount: 118,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-wabi-sabi-fluted-stoneware-vase',
    sellerId: 'seller-clay-kiln',
    sellerStoreName: 'Clay & Kiln Collective',
    title: 'Wabi-Sabi Fluted Stoneware Vessel',
    slug: 'wabi-sabi-fluted-stoneware-vase',
    shortDescription: 'Tall architectural ceramic vessel with tactile vertical ribbing and unglazed raw exterior.',
    description: `An organic architectural centerpiece designed to accommodate dramatic dry foliage or stand alone as a sculptural totem.

Hand-coiled and shaped on a slow wheel, the exterior is left deliberately raw and unglazed to reveal the mineral tooth of the terracotta-clay blend. Glazed interior ensures 100% watertight capability for fresh floral arrangements.`,
    price: 3290,
    compareAtPrice: 4200,
    costPerItem: 1500,
    sku: 'CKC-WBI-VSE-01',
    stock: 19,
    lowStockThreshold: 5,
    categoryId: 'cat-decor',
    categorySlug: 'decor',
    tags: ['vase', 'ceramics', 'wabi-sabi', 'sculpture', 'decor'],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-5/img-1.jpg',
        altText: 'Wabi Sabi ceramic vessel on travertine shelf',
        isPrimary: true,
      },
    ],
    hasVariants: false,
    status: 'active',
    ratings: { average: 4.9, count: 27 },
    salesCount: 76,
    isFeatured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-brutalist-solid-brass-candleholder',
    sellerId: 'seller-lumiere',
    sellerStoreName: 'Lumière Atelier',
    title: 'Brutalist Solid Cast Brass Candleholder',
    slug: 'brutalist-solid-brass-candleholder',
    shortDescription: 'Substantial weighted candelabra cast in solid sand-cast brass with raw textured cavities.',
    description: `Weighing over 1.8 kilograms, this architectural candelabra is cast by hand using traditional sand-molds. The sand-casting process imparts an organic granular texture to the brass surface, ensuring no two pieces are identical.

Holds three standard 22mm taper candles. Left unlacquered so that it gently patinas into a deep golden antique finish over decades of use, or can be buffed with brass polish to retain mirror brilliance.`,
    price: 4990,
    compareAtPrice: 6200,
    costPerItem: 2600,
    sku: 'LUM-BRT-CND-01',
    stock: 12,
    lowStockThreshold: 3,
    categoryId: 'cat-decor',
    categorySlug: 'decor',
    tags: ['candleholder', 'brass', 'brutalist', 'sculptural', 'centerpiece'],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-6/img-1.jpg',
        altText: 'Brutalist solid brass candleholder in evening light',
        isPrimary: true,
      },
    ],
    hasVariants: false,
    status: 'active',
    ratings: { average: 4.8, count: 16 },
    salesCount: 39,
    isFeatured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-kyoto-slatted-oak-bedframe',
    sellerId: 'seller-nordic-oak',
    sellerStoreName: 'Nordic Oak Studios',
    title: 'Kyoto Slatted Oak Platform Bed',
    slug: 'kyoto-slatted-oak-platform-bed',
    shortDescription: 'Low-profile Japandi platform bed with integrated cantilever floating nightstands and slatted headboard.',
    description: `Engineered according to Japanese joinery traditions, the Kyoto Platform Bed requires zero metal screws for frame assembly. The precision interlocking mortise and tenon joints create exceptional structural rigidity while permitting seasonal wood expansion.

Featuring an angled slatted headboard ergonomically inclined for bedtime reading. Includes integrated birch wood suspension slats offering optimal spinal support and ventilation for all foam or hybrid mattresses.`,
    price: 48999,
    compareAtPrice: 58000,
    costPerItem: 31000,
    sku: 'NOS-KYO-BED-01',
    stock: 6,
    lowStockThreshold: 2,
    categoryId: 'cat-bedroom',
    categorySlug: 'bedroom',
    tags: ['bed', 'oak', 'japandi', 'minimalist', 'bedroom'],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1540518614846-7ede433c4ef7?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-7/img-1.jpg',
        altText: 'Kyoto Slatted Oak Bed in Japandi bedroom',
        isPrimary: true,
      },
    ],
    hasVariants: true,
    variants: [
      {
        sku: 'NOS-KYO-BED-Q',
        title: 'Queen (60x78 in)',
        price: 48999,
        compareAtPrice: 58000,
        stock: 4,
        attributes: { size: 'Queen' },
      },
      {
        sku: 'NOS-KYO-BED-K',
        title: 'King (72x78 in)',
        price: 54999,
        compareAtPrice: 65000,
        stock: 2,
        attributes: { size: 'King' },
      },
    ],
    status: 'active',
    ratings: { average: 5.0, count: 21 },
    salesCount: 31,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'prod-atelier-solid-walnut-desk',
    sellerId: 'seller-nordic-oak',
    sellerStoreName: 'Nordic Oak Studios',
    title: 'Atelier Solid Walnut Writing Desk',
    slug: 'atelier-solid-walnut-writing-desk',
    shortDescription: 'American black walnut executive desk with integrated felt-lined stationery drawer and brass wire grommet.',
    description: `Crafted for thinkers, architects, and authors, the Atelier Desk provides an expanse of bookmatched American Black Walnut.

Features a concealed soft-close center drawer lined with charcoal merino wool felt, tailored for tablets, fountain pens, and notebooks. An understated solid brass grommet directs charging cables through the tabletop into an under-desk cable organizer tray.`,
    price: 34500,
    compareAtPrice: 42000,
    costPerItem: 22000,
    sku: 'NOS-ATL-DSK-01',
    stock: 9,
    lowStockThreshold: 2,
    categoryId: 'cat-workspace',
    categorySlug: 'workspace',
    tags: ['desk', 'walnut', 'workspace', 'home-office', 'minimalist'],
    images: [
      {
        url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&q=80&w=1200',
        path: 'products/prod-8/img-1.jpg',
        altText: 'Atelier Solid Walnut Desk in bright workspace',
        isPrimary: true,
      },
    ],
    hasVariants: false,
    status: 'active',
    ratings: { average: 4.9, count: 18 },
    salesCount: 45,
    isFeatured: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

async function seed() {
  console.log(`\n🌱 Starting Casaio Firestore Seeding (Project: ${projectId})...\n`);

  // 1. Seed Categories
  console.log(`📦 Seeding ${categories.length} Categories...`);
  const catBatch = db.batch();
  for (const cat of categories) {
    const ref = db.collection('categories').doc(cat.id);
    catBatch.set(ref, cat, { merge: true });
  }
  await catBatch.commit();
  console.log(`✅ Categories written successfully.`);

  // 2. Seed Sellers
  console.log(`\n👥 Seeding ${sellers.length} Verified Sellers...`);
  const sellerBatch = db.batch();
  for (const seller of sellers) {
    const ref = db.collection('sellers').doc(seller.uid);
    sellerBatch.set(ref, seller, { merge: true });
  }
  await sellerBatch.commit();
  console.log(`✅ Sellers written successfully.`);

  // 3. Seed Products
  console.log(`\n🛋️ Seeding ${products.length} Artisan Products...`);
  const prodBatch = db.batch();
  for (const prod of products) {
    const ref = db.collection('products').doc(prod.id);
    prodBatch.set(ref, prod, { merge: true });
  }
  await prodBatch.commit();
  console.log(`✅ Products written successfully.`);

  console.log(`\n🎉 Seed finished! All collections populated in Firestore.\n`);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
