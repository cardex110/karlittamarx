import { getSupabaseBucket, getSupabaseClient, hasSupabaseConfig } from "./supabase-client.js";

const sanitizeFileName = (name = "image") =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9.\-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "image";

const createCanvas = () => {
  const canvas = document.createElement("canvas");
  return { canvas, context: canvas.getContext("2d") };
};

const compressToJpeg = async (file) => {
  if (!(file instanceof File)) return null;
  if (!("createImageBitmap" in window)) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const MAX_EDGE = 1600;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
  const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

  const { canvas, context } = createCanvas();
  if (!context) return file;

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close?.();

  const blob = await new Promise((resolve) =>
    canvas.toBlob((result) => resolve(result || null), "image/jpeg", 0.82)
  );

  if (!blob) return file;
  return new File([blob], sanitizeFileName(file.name).replace(/\.[^.]+$/, ".jpg"), {
    type: "image/jpeg"
  });
};

const buildStoragePath = (seed) => {
  const prefix = new Date().toISOString().split("T")[0];
  const unique = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : seed;
  const safeSeed = sanitizeFileName(seed);
  return `${prefix}/${unique}-${safeSeed}`;
};

export const uploadListingImages = async (items = []) => {
  if (!items.length) return new Map();
  if (!hasSupabaseConfig()) {
    console.warn("Supabase client not configured; skipping image uploads.");
    return new Map();
  }
  const client = getSupabaseClient();
  const bucket = getSupabaseBucket();
  const results = new Map();

  for (const { id, file } of items) {
    if (!(file instanceof File)) continue;
    const compressed = await compressToJpeg(file);
    const path = buildStoragePath(file.name);
    const { error } = await client.storage.from(bucket).upload(path, compressed, {
      cacheControl: "3600",
      upsert: false
    });
    if (error) {
      console.error("Unable to upload image", error);
      continue;
    }
    const { data: publicData } = client.storage.from(bucket).getPublicUrl(path);
    const url = publicData?.publicUrl || "";
    if (!url) {
      console.warn("Upload succeeded but no public URL was returned", { id, path });
    }
    results.set(id, url);
  }

  return results;
};

const extractStoragePath = (value, bucket) => {
  if (typeof value !== "string") return "";
  const input = value.trim();
  if (!input) return "";
  if (!input.includes("://")) return input;
  try {
    const url = new URL(input);
    const marker = `/${bucket}/`;
    const idx = url.pathname.indexOf(marker);
    if (idx === -1) return "";
    return url.pathname.slice(idx + marker.length).replace(/^public\//, "");
  } catch (error) {
    console.warn("Unable to parse storage URL for removal", { value, error });
    return "";
  }
};

export const removeListingImages = async (paths = []) => {
  if (!paths.length) return;
  if (!hasSupabaseConfig()) {
    console.warn("Supabase client not configured; skipping image removals.");
    return;
  }
  const client = getSupabaseClient();
  const bucket = getSupabaseBucket();
  const normalized = paths
    .map((entry) => extractStoragePath(entry, bucket))
    .filter((entry) => typeof entry === "string" && entry.trim().length);
  if (!normalized.length) return;
  const { error } = await client.storage.from(bucket).remove(normalized);
  if (error) {
    console.error("Unable to remove listing images", error);
  }
};
