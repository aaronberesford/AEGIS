import "server-only";

import { createClient } from "@base44/sdk";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { type Workspace } from "@/lib/types";

type Base44Forklift = {
  id: string;
  listing_id?: string;
  title?: string;
  brand?: string;
  model?: string | null;
  category?: string | null;
  year?: number | null;
  fuel_type?: string | null;
  capacity_tonnes?: number | null;
  hours?: number | null;
  price_display?: string | null;
  stock_status?: string | null;
  mast_height_m?: number | null;
  location?: string | null;
  condition_notes?: string | null;
  card_spec_line?: string | null;
  short_highlights?: string | null;
  updated_date?: string;
};

type Base44PalletTruck = {
  id: string;
  listing_id?: string;
  make?: string;
  model?: string;
  condition?: string;
  price_display?: string | null;
  stock_status?: string | null;
  load_capacity_kg?: number | null;
  updated_date?: string;
};

type Base44Customer = {
  id: string;
  name?: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  type?: string | null;
  notes?: string | null;
  updated_date?: string;
};

type Base44Sale = {
  id: string;
  customer_name?: string | null;
  customer_company?: string | null;
  sale_date?: string | null;
  sale_price?: number | null;
  payment_method?: string | null;
  updated_date?: string;
};

type Base44MaintenanceRecord = {
  id: string;
  forklift_id?: string | null;
  maintenance_type?: string | null;
  service_date?: string | null;
  next_service_date?: string | null;
  status?: string | null;
  technician?: string | null;
  description?: string | null;
  updated_date?: string;
};

type Base44Part = {
  id: string;
  part_number?: string;
  part_name?: string;
  quantity?: number | null;
  min_quantity?: number | null;
  supplier?: string | null;
  compatible_models?: string | null;
  updated_date?: string;
};

type Base44AppMetadata = {
  id: string;
  name?: string;
  user_description?: string;
  page_names?: string[];
};

type Base44WorkspaceData = {
  app: Base44AppMetadata;
  forklifts: Base44Forklift[];
  palletTrucks: Base44PalletTruck[];
  customers: Base44Customer[];
  sales: Base44Sale[];
  maintenance: Base44MaintenanceRecord[];
  parts: Base44Part[];
  fetchedAt: string;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: Base44WorkspaceData }>();

function hasBase44Config() {
  const config = env();
  return Boolean(config.base44AppId && config.base44ApiKey);
}

function isForkliftWorkspace(workspace: Workspace) {
  return (
    workspace.name.toLowerCase().includes("forklift") ||
    workspace.industry.toLowerCase().includes("material")
  );
}

export function isBase44EnabledForWorkspace(workspace: Workspace) {
  const config = env();
  if (!hasBase44Config() || !isForkliftWorkspace(workspace)) {
    return false;
  }

  if (config.base44WorkspaceId) {
    return workspace.id === config.base44WorkspaceId;
  }

  return true;
}

function getBase44Client() {
  const config = env();
  if (!config.base44AppId || !config.base44ApiKey) {
    throw new AppError("Base44 is not configured.", {
      code: "BASE44_NOT_CONFIGURED",
      status: 400,
    });
  }

  return createClient({
    appId: config.base44AppId,
    headers: {
      api_key: config.base44ApiKey,
    },
  });
}

async function fetchBase44Metadata(): Promise<Base44AppMetadata> {
  const config = env();
  const response = await fetch(`https://base44.app/api/apps/${config.base44AppId}`, {
    headers: {
      "X-App-Id": config.base44AppId,
      api_key: config.base44ApiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new AppError(`Base44 metadata request failed: ${detail || response.status}`, {
      code: "BASE44_METADATA_FAILED",
      status: 502,
    });
  }

  return (await response.json()) as Base44AppMetadata;
}

function stockForklifts(items: Base44Forklift[]) {
  return items.filter((item) => (item.stock_status ?? "In Stock") !== "Sold");
}

function stockPalletTrucks(items: Base44PalletTruck[]) {
  return items.filter((item) => (item.stock_status ?? "In Stock") !== "Sold");
}

function lowStockParts(items: Base44Part[]) {
  return items.filter(
    (item) =>
      typeof item.quantity === "number" &&
      typeof item.min_quantity === "number" &&
      item.quantity <= item.min_quantity,
  );
}

function forkliftLine(item: Base44Forklift) {
  const title =
    item.title?.trim() ||
    [item.brand, item.model].filter(Boolean).join(" ").trim() ||
    item.listing_id ||
    "Forklift";
  const details = [
    item.listing_id,
    item.year ? String(item.year) : null,
    item.fuel_type ?? null,
    typeof item.capacity_tonnes === "number" ? `${item.capacity_tonnes}t` : null,
    typeof item.mast_height_m === "number" ? `${item.mast_height_m}m mast` : null,
    item.price_display ?? null,
    item.stock_status ?? null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `${title}${details ? ` — ${details}` : ""}`;
}

function palletTruckLine(item: Base44PalletTruck) {
  const title = [item.make, item.model].filter(Boolean).join(" ").trim() || item.listing_id || "Pallet truck";
  const details = [
    item.listing_id,
    typeof item.load_capacity_kg === "number" ? `${item.load_capacity_kg}kg` : null,
    item.condition ?? null,
    item.price_display ?? null,
    item.stock_status ?? null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `${title}${details ? ` — ${details}` : ""}`;
}

function customerLine(customer: Base44Customer) {
  const title =
    customer.company?.trim() ||
    customer.name?.trim() ||
    customer.email?.trim() ||
    customer.phone?.trim() ||
    "Customer";
  const details = [customer.name, customer.type, customer.phone]
    .filter(Boolean)
    .join(" | ");
  return `${title}${details ? ` — ${details}` : ""}`;
}

function buildAgentContext(data: Base44WorkspaceData) {
  const forklifts = stockForklifts(data.forklifts);
  const pallets = stockPalletTrucks(data.palletTrucks);
  const lowStock = lowStockParts(data.parts);

  return [
    `Base44 app: ${data.app.name ?? "ForkliftPro"}.`,
    data.app.user_description ? `Business info: ${data.app.user_description}` : null,
    data.app.page_names?.length
      ? `Base44 modules available: ${data.app.page_names.join(", ")}.`
      : null,
    `Live stock count: ${forklifts.length} forklifts and ${pallets.length} pallet trucks not marked sold.`,
    forklifts.length
      ? `Current forklift stock highlights:\n${forklifts
          .slice(0, 10)
          .map((item) => `- ${forkliftLine(item)}`)
          .join("\n")}`
      : null,
    pallets.length
      ? `Current pallet truck stock highlights:\n${pallets
          .slice(0, 6)
          .map((item) => `- ${palletTruckLine(item)}`)
          .join("\n")}`
      : null,
    data.customers.length
      ? `Recent customers:\n${data.customers
          .slice(0, 8)
          .map((item) => `- ${customerLine(item)}`)
          .join("\n")}`
      : null,
    data.sales.length
      ? `Recent sales:\n${data.sales
          .slice(0, 5)
          .map((sale) => {
            const name = sale.customer_company || sale.customer_name || "Customer";
            const date = sale.sale_date || "Unknown date";
            const price =
              typeof sale.sale_price === "number"
                ? `£${sale.sale_price.toLocaleString()}`
                : "price not recorded";
            return `- ${name} on ${date}: ${price}`;
          })
          .join("\n")}`
      : null,
    lowStock.length
      ? `Low stock parts:\n${lowStock
          .slice(0, 6)
          .map((part) => {
            const qty = typeof part.quantity === "number" ? part.quantity : "?";
            const min = typeof part.min_quantity === "number" ? part.min_quantity : "?";
            return `- ${part.part_name || part.part_number || "Part"} — qty ${qty}, min ${min}`;
          })
          .join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildWorkspaceSummary(data: Base44WorkspaceData) {
  const forklifts = stockForklifts(data.forklifts);
  const pallets = stockPalletTrucks(data.palletTrucks);
  const lowStock = lowStockParts(data.parts);

  return [
    data.app.user_description ?? `${data.app.name ?? "ForkliftPro"} data is connected.`,
    `${forklifts.length} live forklifts in stock, ${pallets.length} pallet trucks, ${data.customers.length} customers, ${data.sales.length} recorded sales, ${lowStock.length} low-stock parts alerts.`,
  ].join(" ");
}

async function fetchBase44WorkspaceData(): Promise<Base44WorkspaceData> {
  const key = `${env().base44AppId}:forkliftpro`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const client = getBase44Client();
  try {
    const [app, forklifts, palletTrucks, customers, sales, maintenance, parts] =
      await Promise.all([
        fetchBase44Metadata(),
        client.entities.Forklift.list("-updated_date", 120) as Promise<Base44Forklift[]>,
        client.entities.PalletTruck.list("-updated_date", 80) as Promise<Base44PalletTruck[]>,
        client.entities.Customer.list("-updated_date", 120) as Promise<Base44Customer[]>,
        client.entities.Sale.list("-updated_date", 60) as Promise<Base44Sale[]>,
        client.entities.MaintenanceRecord.list(
          "-updated_date",
          80,
        ) as Promise<Base44MaintenanceRecord[]>,
        client.entities.Part.list("-updated_date", 120) as Promise<Base44Part[]>,
      ]);

    const value: Base44WorkspaceData = {
      app,
      forklifts,
      palletTrucks,
      customers,
      sales,
      maintenance,
      parts,
      fetchedAt: new Date().toISOString(),
    };
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
    return value;
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Unable to reach Base44.",
      {
        code: "BASE44_FETCH_FAILED",
        status: 502,
      },
    );
  } finally {
    client.cleanup();
  }
}

export async function testBase44Connection() {
  if (!hasBase44Config()) {
    throw new AppError("Base44 app ID or API key is missing.", {
      code: "BASE44_MISSING_KEY",
      status: 400,
    });
  }

  const data = await fetchBase44WorkspaceData();
  return {
    ok: true,
    detail: `Base44 connection is valid. ${data.app.name ?? "ForkliftPro"} exposes ${stockForklifts(data.forklifts).length} forklifts, ${stockPalletTrucks(data.palletTrucks).length} pallet trucks, and ${data.customers.length} customers.`,
  };
}

export async function enrichWorkspaceWithBase44Knowledge(workspace: Workspace) {
  if (!isBase44EnabledForWorkspace(workspace)) {
    return workspace;
  }

  try {
    const data = await fetchBase44WorkspaceData();
    return {
      ...workspace,
      externalKnowledge: {
        source: "base44",
        appName: data.app.name ?? "ForkliftPro",
        summary: buildWorkspaceSummary(data),
        syncedAt: new Date(data.fetchedAt).toLocaleString([], {
          hour: "2-digit",
          minute: "2-digit",
          month: "short",
          day: "numeric",
        }),
      },
    } satisfies Workspace;
  } catch {
    return workspace;
  }
}

export async function buildBase44KnowledgeContext(workspace: Workspace) {
  if (!isBase44EnabledForWorkspace(workspace)) {
    return null;
  }

  const data = await fetchBase44WorkspaceData();
  return buildAgentContext(data);
}

export async function buildBase44VoiceInventorySummary(workspace: Workspace) {
  if (!isBase44EnabledForWorkspace(workspace)) {
    return null;
  }

  const data = await fetchBase44WorkspaceData();
  const forklifts = stockForklifts(data.forklifts);
  const pallets = stockPalletTrucks(data.palletTrucks);

  return [
    `Business info: ${data.app.user_description ?? workspace.name}.`,
    `Live forklift stock: ${forklifts.length} forklifts and ${pallets.length} pallet trucks available or reserved.`,
    forklifts.slice(0, 12).map((item) => forkliftLine(item)).join("\n"),
    pallets.length
      ? `Pallet trucks:\n${pallets.slice(0, 5).map((item) => palletTruckLine(item)).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function searchBase44Inventory(workspace: Workspace, query?: string) {
  if (!isBase44EnabledForWorkspace(workspace)) {
    return [];
  }

  const data = await fetchBase44WorkspaceData();
  const haystack = query?.trim().toLowerCase() ?? "";
  const inventory = [...stockForklifts(data.forklifts), ...stockPalletTrucks(data.palletTrucks)];
  if (!haystack) {
    return inventory.slice(0, 8).map((item) =>
      "brand" in item || "fuel_type" in item ? forkliftLine(item as Base44Forklift) : palletTruckLine(item as Base44PalletTruck),
    );
  }

  return inventory
    .filter((item) => {
      const values =
        "brand" in item || "fuel_type" in item
          ? [
              (item as Base44Forklift).listing_id,
              (item as Base44Forklift).title,
              (item as Base44Forklift).brand,
              (item as Base44Forklift).model,
              (item as Base44Forklift).fuel_type,
              (item as Base44Forklift).category,
            ]
          : [
              (item as Base44PalletTruck).listing_id,
              (item as Base44PalletTruck).make,
              (item as Base44PalletTruck).model,
              (item as Base44PalletTruck).condition,
            ];
      return values.filter(Boolean).some((value) => String(value).toLowerCase().includes(haystack));
    })
    .slice(0, 8)
    .map((item) =>
      "brand" in item || "fuel_type" in item ? forkliftLine(item as Base44Forklift) : palletTruckLine(item as Base44PalletTruck),
    );
}

export async function searchBase44Customers(workspace: Workspace, query: string) {
  if (!isBase44EnabledForWorkspace(workspace)) {
    return [];
  }

  const data = await fetchBase44WorkspaceData();
  const haystack = query.trim().toLowerCase();
  if (!haystack) {
    return data.customers.slice(0, 8).map(customerLine);
  }

  return data.customers
    .filter((customer) =>
      [customer.name, customer.company, customer.email, customer.phone, customer.type]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(haystack)),
    )
    .slice(0, 8)
    .map(customerLine);
}
