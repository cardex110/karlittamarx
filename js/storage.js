import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
  deleteField
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { db } from "./firebase.js";

const COLLECTION = "listings";
const listingCollection = collection(db, COLLECTION);

const INQUIRY_COLLECTION = "inquiry_forms";
const inquiryCollection = collection(db, INQUIRY_COLLECTION);
const inquiryDoc = (id) => doc(db, INQUIRY_COLLECTION, id);

const LEGACY_PRIMARY_IMAGE_FIELD = ["primary", "Image", "Index"].join("");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const normalizePhoneNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return digits;
};

const listingDoc = (id) => doc(db, COLLECTION, id);

const normalizeTimestamp = (value) => {
  if (!value) return null;
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const stripLegacyPrimaryImageField = (value) => {
  if (!value || typeof value !== "object") return value;
  const clone = { ...value };
  delete clone[LEGACY_PRIMARY_IMAGE_FIELD];
  return clone;
};

const sanitizeArticle = (article) => {
  if (!article || typeof article !== "object") return null;
  const articleWithoutLegacy = stripLegacyPrimaryImageField(article);

  const base = {
    id: "unknown",
    title: "untitled",
    size: "",
    price: "",
    currency: "USD",
    description: "",
    images: [],
    sold: false,
    reserved: false,
    createdAt: new Date().toISOString(),
    displayOrder: Number.MAX_SAFE_INTEGER
  };

  const sanitizeImages = (value, fallbackUrl) => {
    const list = Array.isArray(value) ? value : [];
    const cleaned = list
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === "string") {
          const url = entry.trim();
          return url ? url : null;
        }
        if (typeof entry === "object") {
          const url = String(entry.url ?? entry.path ?? "").trim();
          return url ? url : null;
        }
        return null;
      })
      .filter(Boolean);

    if (!cleaned.length && typeof fallbackUrl === "string" && fallbackUrl.trim().length) {
      cleaned.push(fallbackUrl.trim());
    }

    return cleaned;
  };

  const clean = {
    ...base,
    ...articleWithoutLegacy,
    id: String(articleWithoutLegacy.id ?? base.id).trim() || base.id,
    title: String(articleWithoutLegacy.title ?? base.title).trim() || base.title,
    size: String(articleWithoutLegacy.size ?? base.size).trim(),
    price: String(articleWithoutLegacy.price ?? base.price).trim(),
    currency:
      String(articleWithoutLegacy.currency ?? base.currency).trim().toUpperCase() || base.currency,
    description: String(articleWithoutLegacy.description ?? base.description).trim(),
    sold: Boolean(articleWithoutLegacy?.sold),
    reserved: Boolean(articleWithoutLegacy?.reserved),
    displayOrder: Number.isFinite(Number(articleWithoutLegacy.displayOrder))
      ? Number(articleWithoutLegacy.displayOrder)
      : base.displayOrder
  };

  const iso = normalizeTimestamp(articleWithoutLegacy.createdAt);
  clean.createdAt = iso ?? base.createdAt;

  const fallbackUrl =
    typeof articleWithoutLegacy?.image === "string" ? articleWithoutLegacy.image.trim() : "";
  clean.images = sanitizeImages(
    articleWithoutLegacy.images ?? clean.images ?? base.images,
    fallbackUrl
  );
  if (!clean.images.length) {
    clean.coverImage = "";
  } else {
    clean.coverImage = clean.images[0] ?? "";
  }

  return clean;
};

const fromSnapshot = (snapshot) => sanitizeArticle({ id: snapshot.id, ...snapshot.data() });

const sanitizeInquiry = (entry) => {
  if (!entry || typeof entry !== "object") return null;

  const trim = (value) => String(value ?? "").trim();
  const cleanName = trim(entry.name);
  const cleanEmail = trim(entry.email).toLowerCase();
  const cleanPhoneRaw = trim(entry.phone);
  const cleanMessage = trim(entry.message);
  const formattedPhone = normalizePhoneNumber(cleanPhoneRaw);
  if (!cleanName || !cleanEmail || !formattedPhone) return null;
  if (!EMAIL_PATTERN.test(cleanEmail)) return null;

  const normalizeString = (value) => {
    if (value == null) return "";
    return String(value).trim();
  };

  const iso = normalizeTimestamp(entry.createdAt);

  const listingPrice = normalizeString(entry.listingPrice);
  const listingCurrency = normalizeString(entry.listingCurrency).toUpperCase();
  const listingPriceDisplay = normalizeString(entry.listingPriceDisplay);

  return {
    id: String(entry.id ?? "").trim() || null,
    name: cleanName,
    email: cleanEmail,
    phone: formattedPhone,
    message: cleanMessage || null,
    listingId: normalizeString(entry.listingId),
    listingTitle: normalizeString(entry.listingTitle),
    listingPrice,
    listingCurrency,
    listingPriceDisplay,
    createdAt: iso
  };
};

const fromInquirySnapshot = (snapshot) =>
  sanitizeInquiry({ id: snapshot.id, ...snapshot.data() });

const toFirestorePayload = (article) => {
  const clean = sanitizeArticle(article);
  if (!clean) return null;

  const payload = {
    title: clean.title,
    size: clean.size,
    price: clean.price,
    currency: clean.currency,
    description: clean.description,
    images: clean.images,
    sold: clean.sold,
    reserved: clean.reserved,
    displayOrder: clean.displayOrder
  };

  if (clean.createdAt) {
    payload.createdAt = Timestamp.fromDate(new Date(clean.createdAt));
  }

  return payload;
};

export const loadArticles = async () => {
  const snapshot = await getDocs(query(listingCollection, orderBy("createdAt", "desc")));
  return snapshot.docs.map(fromSnapshot).filter(Boolean);
};

export const subscribeToArticles = (onChange) => {
  const listener = onSnapshot(query(listingCollection, orderBy("createdAt", "desc")), (snapshot) => {
    const next = snapshot.docs.map(fromSnapshot).filter(Boolean);
    onChange?.(next);
  });
  return () => listener();
};

export const appendArticle = async (article) => {
  const payload = toFirestorePayload({
    ...(article ?? {}),
    createdAt: null
  });

  if (!payload) return loadArticles();

  payload.createdAt = serverTimestamp();
  await addDoc(listingCollection, payload);
  return loadArticles();
};

export const updateArticle = async (id, article) => {
  const targetId = String(id ?? "").trim();
  if (!targetId) return loadArticles();

  const payload = toFirestorePayload(article);
  if (!payload) return loadArticles();

  delete payload.createdAt;
  payload[LEGACY_PRIMARY_IMAGE_FIELD] = deleteField();
  await updateDoc(listingDoc(targetId), payload);
  return loadArticles();
};

export const deleteArticle = async (id) => {
  const targetId = String(id ?? "").trim();
  if (!targetId) return loadArticles();

  await deleteDoc(listingDoc(targetId));
  return loadArticles();
};

export const reorderArticles = async (orderedIds = []) => {
  const ids = Array.isArray(orderedIds) ? orderedIds.filter((id) => typeof id === "string" && id.trim()) : [];
  if (!ids.length) return loadArticles();

  const batch = writeBatch(db);

  ids.forEach((id, index) => {
    batch.update(listingDoc(id), {
      displayOrder: index,
      [LEGACY_PRIMARY_IMAGE_FIELD]: deleteField()
    });
  });

  await batch.commit();
  return loadArticles();
};

export const saveArticles = async (articles) => {
  const snapshot = await getDocs(listingCollection);
  const batch = writeBatch(db);

  snapshot.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });

  articles
    ?.map((entry) => ({ entry, payload: toFirestorePayload(entry) }))
    .filter(({ payload }) => Boolean(payload))
    .forEach(({ payload }) => {
      const docRef = doc(listingCollection);
      if (!payload.createdAt) {
        payload.createdAt = serverTimestamp();
      }
      batch.set(docRef, payload);
    });

  await batch.commit();
  return loadArticles();
};

export const resetArticles = async () => {
  const snapshot = await getDocs(listingCollection);
  const batch = writeBatch(db);

  snapshot.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });

  await batch.commit();
  return [];
};

export const submitInquiryForm = async ({
  name,
  email,
  phone,
  message,
  listingId,
  listingTitle,
  listingPrice,
  listingCurrency,
  listingPriceDisplay
}) => {
  const trimmedName = String(name ?? "").trim();
  const trimmedEmail = String(email ?? "").trim().toLowerCase();
  const trimmedPhoneRaw = String(phone ?? "").trim();
  const trimmedMessage = String(message ?? "").trim();
  const trimmedListingId = String(listingId ?? "").trim();
  const trimmedListingTitle = String(listingTitle ?? "").trim();
  const trimmedListingPrice = String(listingPrice ?? "").trim();
  const trimmedListingCurrency = String(listingCurrency ?? "").trim().toUpperCase();
  const trimmedListingPriceDisplay = String(listingPriceDisplay ?? "").trim();

  const formattedPhone = normalizePhoneNumber(trimmedPhoneRaw);

  if (!trimmedName || !trimmedEmail || !formattedPhone) {
    throw new Error("Missing required inquiry fields");
  }

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    throw new Error("Invalid email address");
  }

  if (!formattedPhone) {
    throw new Error("Invalid phone number");
  }

  const payload = {
    name: trimmedName,
    email: trimmedEmail,
    phone: formattedPhone,
    message: trimmedMessage || null,
    listingId: trimmedListingId || null,
    listingTitle: trimmedListingTitle || null,
    listingPrice: trimmedListingPrice || null,
    listingCurrency: trimmedListingCurrency || null,
    listingPriceDisplay: trimmedListingPriceDisplay || null,
    createdAt: serverTimestamp()
  };

  await addDoc(inquiryCollection, payload);
};

export const loadInquiryForms = async () => {
  const snapshot = await getDocs(query(inquiryCollection, orderBy("createdAt", "desc")));
  return snapshot.docs.map(fromInquirySnapshot).filter(Boolean);
};

export const subscribeToInquiryForms = (onChange) => {
  const listener = onSnapshot(query(inquiryCollection, orderBy("createdAt", "desc")), (snapshot) => {
    const next = snapshot.docs.map(fromInquirySnapshot).filter(Boolean);
    onChange?.(next);
  });
  return () => listener();
};

export const deleteInquiryForm = async (id) => {
  const targetId = String(id ?? "").trim();
  if (!targetId) return loadInquiryForms();

  await deleteDoc(inquiryDoc(targetId));
  return loadInquiryForms();
};
