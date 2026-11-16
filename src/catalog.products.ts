import { withTimeoutSignal } from "./http.helpers.js";
import type { ProjectConfig } from "./projects/index.js";

// Every project's storefront exposes the same public product API (see project.catalog.productApiUrl).

type ApiCategory = {
  id: number;
  name: string;
  slug: string;
};

type ApiProduct = {
  id: number;
  name: string;
  short_description?: string | null;
  price?: number | string | null;
  sale_price?: number | string | null;
  stock_status?: string | null;
  slug: string;
  orders_count?: number;
  is_featured?: number;
  is_trending?: number;

  product_thumbnail?: {
    asset_url?: string;
  } | null;

  categories?: ApiCategory[];
};

type ProductApiResponse = {
  data: ApiProduct[];
  current_page: number;
  last_page: number;
  total: number;
};

export type MarketingProduct = {
  id: number;
  name: string;
  description: string;
  price: number | null;
  salePrice: number | null;
  stockStatus: string;
  slug: string;
  url: string;
  image: string | null;
  categories: string[];
  ordersCount: number;
  featured: boolean;
  trending: boolean;
};

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isNaN(number) ? null : number;
}

function cleanProduct(project: ProjectConfig, product: ApiProduct): MarketingProduct {
  return {
    id: product.id,

    name: product.name,

    description:
      product.short_description?.trim() || "",

    price: toNumber(product.price),

    salePrice: toNumber(product.sale_price),

    stockStatus:
      product.stock_status || "unknown",

    slug: product.slug,

    url: `${project.storefront.defaultBaseUrl}/${project.storefront.paths.product}/${product.slug}`,

    image:
      product.product_thumbnail?.asset_url ||
      null,

    categories: [
      ...new Set(
        product.categories?.map(
          (category) => category.name
        ) || []
      ),
    ],

    ordersCount:
      product.orders_count || 0,

    featured:
      product.is_featured === 1,

    trending:
      product.is_trending === 1,
  };
}

async function fetchProductPage(
  project: ProjectConfig,
  page: number,
  signal?: AbortSignal,
): Promise<ProductApiResponse> {
  const response = await fetch(
    `${project.catalog.productApiUrl}?page=${page}`,
    { signal: withTimeoutSignal(30_000, signal) },
  );

  if (!response.ok) {
    throw new Error(
      `${project.brand.name} product API failed: ${response.status}`
    );
  }

  return response.json() as Promise<ProductApiResponse>;
}

export async function getCatalogProducts(project: ProjectConfig, signal?: AbortSignal) {
  const firstPage = await fetchProductPage(project, 1, signal);

  const pages = Array.from(
    {
      length: firstPage.last_page - 1,
    },
    (_, index) => index + 2
  );

  const remainingPages = await Promise.all(
    pages.map((page) => fetchProductPage(project, page, signal))
  );

  const products = [
    ...firstPage.data,
    ...remainingPages.flatMap(
      (page) => page.data
    ),
  ];

  return products.map((product) => cleanProduct(project, product));
}
