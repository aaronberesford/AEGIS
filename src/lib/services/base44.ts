import "server-only";

import { createClient } from "@base44/sdk";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { type Workspace } from "@/lib/types";

type Base44Forklift = {
  id: string;
  listing_id?: string;
  url_path?: string | null;
  slug?: string | null;
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
  mast_type?: string | null;
  free_lift?: boolean | null;
  sideshift?: boolean | null;
  attachments?: string[] | null;
  tyres_use_type?: string | null;
  loler_status?: string | null;
  loler_expiry_date?: string | null;
  condition_notes?: string | null;
  short_highlights?: string | null;
  delivery_info?: string | null;
  location?: string | null;
  battery_condition?: string | null;
  condition_grade?: string | null;
  card_spec_line?: string | null;
  card_headline?: string | null;
  ebay_listing_status?: string | null;
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

export type Base44CustomerRecord = {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  type: string | null;
  notes: string | null;
};

export type Base44ForkliftRecord = {
  id: string;
  listingId: string | null;
  urlPath: string | null;
  slug: string | null;
  title: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  fuelType: string | null;
  capacityTonnes: number | null;
  priceDisplay: string | null;
  stockStatus: string | null;
  mastHeightMetres: number | null;
  mastHeightLabel: string | null;
  mastType: string | null;
  location: string | null;
  deliveryInfo: string | null;
  sideshift: boolean;
  freeLift: boolean;
  attachments: string[];
  lolerStatus: string | null;
  conditionNotes: string | null;
  shortHighlights: string | null;
  batteryCondition: string | null;
  conditionGrade: string | null;
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

function forkliftTitle(item: Base44Forklift) {
  return (
    item.title?.trim() ||
    [item.brand, item.model].filter(Boolean).join(" ").trim() ||
    item.listing_id ||
    "Forklift"
  );
}

function normalizeMastHeightLabel(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  if (value > 100) {
    return `${(value / 1000).toFixed(1)}m mast`;
  }

  return `${value}m mast`;
}

function forkliftLine(item: Base44Forklift) {
  const details = [
    item.listing_id,
    item.year ? String(item.year) : null,
    item.fuel_type ?? null,
    typeof item.capacity_tonnes === "number" ? `${item.capacity_tonnes}t` : null,
    normalizeMastHeightLabel(item.mast_height_m),
    item.mast_type ?? null,
    item.price_display ?? null,
    item.stock_status ?? null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `${forkliftTitle(item)}${details ? ` - ${details}` : ""}`;
}

function forkliftRichSummary(item: Base44Forklift) {
  const extras = [
    item.condition_grade ? `Condition: ${item.condition_grade}` : null,
    item.battery_condition ? `Battery: ${item.battery_condition}` : null,
    item.loler_status ? `LOLER: ${item.loler_status}` : null,
    item.location ? `Location: ${item.location}` : null,
    item.attachments?.length ? `Attachments: ${item.attachments.join(", ")}` : null,
    item.sideshift ? "Includes sideshift" : null,
    item.free_lift ? "Includes free lift" : null,
    item.short_highlights ?? null,
    item.condition_notes ?? null,
  ]
    .filter(Boolean)
    .join(". ");

  return `${forkliftLine(item)}${extras ? `. ${extras}` : ""}`;
}

function forkliftSearchFields(item: Base44Forklift) {
  return [
    item.listing_id,
    item.url_path,
    item.slug,
    item.title,
    item.brand,
    item.model,
    item.category,
    item.year ? String(item.year) : null,
    item.fuel_type,
    typeof item.capacity_tonnes === "number" ? `${item.capacity_tonnes}` : null,
    typeof item.hours === "number" ? `${item.hours}` : null,
    item.price_display,
    item.stock_status,
    typeof item.mast_height_m === "number" ? `${item.mast_height_m}` : null,
    item.mast_type,
    item.free_lift ? "free lift" : null,
    item.sideshift ? "sideshift" : null,
    item.attachments?.join(" "),
    item.tyres_use_type,
    item.loler_status,
    item.delivery_info,
    item.location,
    item.condition_notes,
    item.short_highlights,
    item.battery_condition,
    item.condition_grade,
    item.card_spec_line,
    item.card_headline,
    item.ebay_listing_status,
  ].filter(Boolean);
}

function palletTruckLine(item: Base44PalletTruck) {
  const title =
    [item.make, item.model].filter(Boolean).join(" ").trim() ||
    item.listing_id ||
    "Pallet truck";
  const details = [
    item.listing_id,
    typeof item.load_capacity_kg === "number" ? `${item.load_capacity_kg}kg` : null,
    item.condition ?? null,
    item.price_display ?? null,
    item.stock_status ?? null,
  ]
    .filter(Boolean)
    .join(" | ");

  return `${title}${details ? ` - ${details}` : ""}`;
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
  return `${title}${details ? ` - ${details}` : ""}`;
}

function normalizePhone(value: string | null | undefined) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

function phoneCandidates(phoneNumber: string) {
  const normalized = normalizePhone(phoneNumber);
  const digitsOnly = normalized.replace(/[^\d]/g, "");
  const suffix = digitsOnly.length > 9 ? digitsOnly.slice(-9) : digitsOnly;

  return new Set([normalized, digitsOnly, suffix].filter(Boolean));
}

function mapCustomerRecord(customer: Base44Customer): Base44CustomerRecord {
  return {
    id: customer.id,
    name: customer.name?.trim() || "Unknown customer",
    company: customer.company?.trim() || null,
    email: customer.email?.trim() || null,
    phone: customer.phone?.trim() || null,
    type: customer.type?.trim() || null,
    notes: customer.notes?.trim() || null,
  };
}

function mapForkliftRecord(item: Base44Forklift): Base44ForkliftRecord {
  return {
    id: item.id,
    listingId: item.listing_id?.trim() || null,
    urlPath: item.url_path?.trim() || null,
    slug: item.slug?.trim() || null,
    title: forkliftTitle(item),
    brand: item.brand?.trim() || null,
    model: item.model?.trim() || null,
    year: typeof item.year === "number" ? item.year : null,
    fuelType: item.fuel_type?.trim() || null,
    capacityTonnes:
      typeof item.capacity_tonnes === "number" ? item.capacity_tonnes : null,
    priceDisplay: item.price_display?.trim() || null,
    stockStatus: item.stock_status?.trim() || null,
    mastHeightMetres:
      typeof item.mast_height_m === "number"
        ? item.mast_height_m > 100
          ? Number((item.mast_height_m / 1000).toFixed(1))
          : item.mast_height_m
        : null,
    mastHeightLabel: normalizeMastHeightLabel(item.mast_height_m),
    mastType: item.mast_type?.trim() || null,
    location: item.location?.trim() || null,
    deliveryInfo: item.delivery_info?.trim() || null,
    sideshift: Boolean(item.sideshift),
    freeLift: Boolean(item.free_lift),
    attachments: Array.isArray(item.attachments) ? item.attachments.map(String) : [],
    lolerStatus: item.loler_status?.trim() || null,
    conditionNotes: item.condition_notes?.trim() || null,
    shortHighlights: item.short_highlights?.trim() || null,
    batteryCondition: item.battery_condition?.trim() || null,
    conditionGrade: item.condition_grade?.trim() || null,
  };
}

function normalizeReference(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function forkliftReferenceFields(item: Base44Forklift) {
  return [
    item.listing_id,
    item.url_path,
    item.slug,
    item.title,
    item.brand,
    item.model,
    [item.brand, item.model].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .map((value) => String(value));
}

export function buildBase44ForkliftListingLink(record: Base44ForkliftRecord) {
  if (!record.urlPath) {
    return null;
  }

  if (/^https?:\/\//i.test(record.urlPath)) {
    return record.urlPath;
  }

  const base = env().forkliftWebsiteBaseUrl.trim();
  if (!base) {
    return record.urlPath;
  }

  return `${base.replace(/\/$/, "")}/${record.urlPath.replace(/^\//, "")}`;
}

export function buildBase44ForkliftCustomerSummary(record: Base44ForkliftRecord) {
  const details = [
    record.listingId,
    record.year ? String(record.year) : null,
    record.fuelType,
    typeof record.capacityTonnes === "number" ? `${record.capacityTonnes}t` : null,
    record.mastHeightLabel,
    record.mastType,
    record.priceDisplay,
    record.stockStatus,
  ]
    .filter(Boolean)
    .join(" | ");

  const extras = [
    record.conditionGrade ? `Condition: ${record.conditionGrade}` : null,
    record.batteryCondition ? `Battery: ${record.batteryCondition}` : null,
    record.lolerStatus ? `LOLER: ${record.lolerStatus}` : null,
    record.location ? `Location: ${record.location}` : null,
    record.attachments.length ? `Attachments: ${record.attachments.join(", ")}` : null,
    record.sideshift ? "Includes sideshift" : null,
    record.freeLift ? "Includes free lift" : null,
    record.shortHighlights,
    record.conditionNotes,
  ]
    .filter(Boolean)
    .join(". ");

  return `${record.title}${details ? ` - ${details}` : ""}${extras ? `. ${extras}` : ""}`;
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
          .map((item) => `- ${forkliftRichSummary(item)}`)
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
                ? `GBP ${sale.sale_price.toLocaleString()}`
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
            return `- ${part.part_name || part.part_number || "Part"} - qty ${qty}, min ${min}`;
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
        client.entities.PalletTruck.list(
          "-updated_date",
          80,
        ) as Promise<Base44PalletTruck[]>,
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
    forklifts.slice(0, 12).map((item) => forkliftRichSummary(item)).join("\n"),
    pallets.length
      ? `Pallet trucks:\n${pallets
          .slice(0, 5)
          .map((item) => palletTruckLine(item))
          .join("\n")}`
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
      "brand" in item || "fuel_type" in item
        ? forkliftRichSummary(item as Base44Forklift)
        : palletTruckLine(item as Base44PalletTruck),
    );
  }

  return inventory
    .filter((item) => {
      const values =
        "brand" in item || "fuel_type" in item
          ? forkliftSearchFields(item as Base44Forklift)
          : [
              (item as Base44PalletTruck).listing_id,
              (item as Base44PalletTruck).make,
              (item as Base44PalletTruck).model,
              (item as Base44PalletTruck).condition,
            ];
      return values
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(haystack));
    })
    .slice(0, 8)
    .map((item) =>
      "brand" in item || "fuel_type" in item
        ? forkliftRichSummary(item as Base44Forklift)
        : palletTruckLine(item as Base44PalletTruck),
    );
}

export async function findBase44ForkliftByReference(
  workspace: Workspace,
  input: {
    listingId?: string | null;
    title?: string | null;
    query?: string | null;
  },
) {
  if (!isBase44EnabledForWorkspace(workspace)) {
    return null;
  }

  const data = await fetchBase44WorkspaceData();
  const available = stockForklifts(data.forklifts);
  const listingIdNeedle = normalizeReference(input.listingId);
  const titleNeedle = normalizeReference(input.title);
  const queryNeedle = normalizeReference(input.query);

  const exactMatch = available.find((item) =>
    forkliftReferenceFields(item)
      .map(normalizeReference)
      .some((field) =>
        [listingIdNeedle, titleNeedle].filter(Boolean).some((needle) => field === needle),
      ),
  );

  if (exactMatch) {
    return mapForkliftRecord(exactMatch);
  }

  const fuzzyNeedles = [listingIdNeedle, titleNeedle, queryNeedle].filter(Boolean);
  const fuzzyMatch = available.find((item) => {
    const fields = forkliftReferenceFields(item)
      .map(normalizeReference)
      .filter(Boolean);
    return fuzzyNeedles.some((needle) => fields.some((field) => field.includes(needle)));
  });

  return fuzzyMatch ? mapForkliftRecord(fuzzyMatch) : null;
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

export async function findBase44CustomerByPhone(
  workspace: Workspace,
  phoneNumber: string,
) {
  if (!isBase44EnabledForWorkspace(workspace) || !phoneNumber.trim()) {
    return null;
  }

  const data = await fetchBase44WorkspaceData();
  const candidates = phoneCandidates(phoneNumber);
  const match = data.customers.find((customer) => {
    const customerCandidates = phoneCandidates(customer.phone ?? "");
    return [...customerCandidates].some((candidate) => candidates.has(candidate));
  });

  return match ? mapCustomerRecord(match) : null;
}

export async function upsertBase44CustomerFromCall(
  workspace: Workspace,
  input: {
    phoneNumber: string;
    name?: string | null;
    company?: string | null;
    email?: string | null;
    existingCustomerId?: string | null;
    type?: string | null;
    historyNote: string;
  },
) {
  if (!isBase44EnabledForWorkspace(workspace)) {
    return null;
  }

  const client = getBase44Client();
  try {
    const existing =
      (input.existingCustomerId
        ? ((await client.entities.Customer.get(input.existingCustomerId)) as Base44Customer)
        : null) ?? (await findBase44CustomerByPhone(workspace, input.phoneNumber));

    const nextNotes = [existing?.notes, input.historyNote].filter(Boolean).join("\n\n");

    if (existing) {
      const updated = (await client.entities.Customer.update(existing.id, {
        name: input.name?.trim() || existing.name,
        company: input.company?.trim() || existing.company,
        email: input.email?.trim() || existing.email,
        phone: input.phoneNumber.trim() || existing.phone,
        type: input.type?.trim() || existing.type || "Customer",
        notes: nextNotes,
      })) as Base44Customer;

      cache.clear();
      return mapCustomerRecord(updated);
    }

    const created = (await client.entities.Customer.create({
      name: input.name?.trim() || "Unknown caller",
      company: input.company?.trim() || "",
      email: input.email?.trim() || "",
      phone: input.phoneNumber.trim(),
      type: input.type?.trim() || "Lead",
      notes: input.historyNote,
    })) as Base44Customer;

    cache.clear();
    return mapCustomerRecord(created);
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : "Unable to update Base44 customer.",
      {
        code: "BASE44_CUSTOMER_UPSERT_FAILED",
        status: 502,
      },
    );
  } finally {
    client.cleanup();
  }
}
