const REQUEST_TIMEOUT_MS = 30_000;

type Json = Record<string, any>;

function config() {
  const baseUrl = process.env.GF_ADMIN_API_URL?.replace(/\/+$/, "");
  const email = process.env.GF_ADMIN_EMAIL;
  const password = process.env.GF_ADMIN_PASSWORD;
  if (!baseUrl || !email || !password) {
    throw new Error("GF_ADMIN_API_URL, GF_ADMIN_EMAIL and GF_ADMIN_PASSWORD must be set");
  }
  return { baseUrl, email, password };
}

export const gfApiHost = () => new URL(config().baseUrl).host;

async function http(url: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const message = (body && typeof body === "object" && body.message) || (typeof body === "string" ? body.slice(0, 200) : "request failed");
    throw new Error(`GF API ${init.method ?? "GET"} ${new URL(url).pathname} -> ${res.status}: ${message}`);
  }
  return body;
}

export async function gfLogin(): Promise<string> {
  const { baseUrl, email, password } = config();
  const body = await http(`${baseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!body?.access_token) throw new Error("GF API login returned no access_token");
  return body.access_token;
}

export type GfClient = ReturnType<typeof createGfClient>;

export function createGfClient(token: string) {
  const { baseUrl } = config();
  const auth = { Authorization: `Bearer ${token}` };
  const get = (path: string, params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
    return http(`${baseUrl}${path}${qs ? `?${qs}` : ""}`, { headers: auth });
  };
  const rows = (body: any): Json[] => (Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : body?.data?.data ?? []);

  return {
    async listBlogs() {
      return rows(await get("/blog", { paginate: 500 }));
    },
    async listBlogCategories() {
      return rows(await get("/category", { type: "post", paginate: 200 }));
    },
    async searchProducts(search: string, limit = 10) {
      return rows(await get("/product", { status: 1, is_approved: 1, paginate: limit, ...(search ? { search } : {}) }));
    },
    async uploadAttachment(file: Buffer, fileName: string, mimeType: string): Promise<number> {
      const form = new FormData();
      form.append("attachments[]", new Blob([new Uint8Array(file)], { type: mimeType }), fileName);
      const body = await http(`${baseUrl}/attachment`, { method: "POST", headers: auth, body: form });
      const id = Array.isArray(body) ? body[0]?.id : body?.id ?? body?.data?.[0]?.id;
      if (!id) throw new Error("GF API attachment upload returned no id");
      return Number(id);
    },
    async createBlog(payload: Json) {
      return http(`${baseUrl}/blog`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    async setBlogStatus(id: number, status: 0 | 1) {
      return http(`${baseUrl}/blog/${id}/${status}`, { method: "PUT", headers: auth });
    },
  };
}

export async function withGfClient<T>(fn: (client: GfClient) => Promise<T>): Promise<T> {
  return fn(createGfClient(await gfLogin()));
}
