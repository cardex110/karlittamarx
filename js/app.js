import {
  loadArticles,
  appendArticle,
  subscribeToArticles,
  updateArticle,
  deleteArticle,
  reorderArticles,
  loadInquiryForms,
  subscribeToInquiryForms,
  deleteInquiryForm
} from "./storage.js";
import {
  initUI,
  renderListings,
  updateStats,
  prepareCreateForm,
  prepareEditForm,
  closeDetailPanel,
  renderInquiries
} from "./ui.js";
import { uploadListingImages, removeListingImages } from "./media-storage.js";

let articles = [];
let bootstrapped = false;
let unsubscribe = null;
let editingArticle = null;
let inquiries = [];
let rawInquiries = [];
let unsubscribeInquiries = null;

const statsFromArticles = (items) => ({
  total: items.length
});

const sortArticles = (items) =>
  [...items].sort((a, b) => {
    const normalizeOrder = (value) => (Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER);
    const diff = normalizeOrder(a.displayOrder) - normalizeOrder(b.displayOrder);
    if (diff !== 0) return diff;
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

const renderScene = () => {
  const visible = sortArticles(articles);
  renderListings(visible);
  updateStats(statsFromArticles(articles));
};

const formatInquiryPrice = (price, currency) => {
  const raw = String(price ?? "").trim();
  if (!raw) return "";
  const code = (currency || "USD").toUpperCase();
  const sanitized = raw.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(sanitized)) {
    return `${code} ${raw}`;
  }
  const amount = Number(sanitized);
  if (!Number.isFinite(amount)) {
    return `${code} ${raw}`;
  }
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const formatted = formatter.format(amount);
  const prefixMap = {
    USD: "US$",
    CAD: "CA$"
  };
  const prefix = prefixMap[code] || `${code} `;
  return `${prefix}${formatted}`;
};

const sortInquiries = (items = []) =>
  [...items].sort((a, b) => {
    const aTime = new Date(a?.createdAt || 0).getTime();
    const bTime = new Date(b?.createdAt || 0).getTime();
    return bTime - aTime;
  });

const resolveListingImage = (listing) => {
  if (!listing) return "";
  if (typeof listing.coverImage === "string" && listing.coverImage.trim()) {
    return listing.coverImage.trim();
  }
  if (Array.isArray(listing.images)) {
    for (const entry of listing.images) {
      if (typeof entry === "string" && entry.trim()) {
        return entry.trim();
      }
      if (entry && typeof entry === "object") {
        const url = String(entry.url ?? entry.path ?? "").trim();
        if (url) return url;
      }
    }
  }
  if (typeof listing.image === "string" && listing.image.trim()) {
    return listing.image.trim();
  }
  return "";
};

const decorateInquiry = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const listingId = typeof entry.listingId === "string" ? entry.listingId.trim() : "";
  const listing = listingId ? articles.find((item) => item.id === listingId) ?? null : null;
  const title = listing?.title || (typeof entry.listingTitle === "string" ? entry.listingTitle.trim() : "");
  const price = listing?.price ?? entry.listingPrice;
  const currency = listing?.currency ?? entry.listingCurrency;
  const displayPrice = formatInquiryPrice(price, currency) || entry.listingPriceDisplay || "";
  const size = listing?.size || (typeof entry.listingSize === "string" ? entry.listingSize.trim() : "");
  const status = listing?.sold ? "sold" : listing?.reserved ? "reserved" : "";

  return {
    ...entry,
    listing,
    listingTitle: title,
    listingPriceDisplay: displayPrice,
    listingSize: size,
    listingStatus: status,
    listingImage: resolveListingImage(listing)
  };
};

const refreshInquiries = () => {
  inquiries = sortInquiries(rawInquiries.map(decorateInquiry).filter(Boolean));
  renderInquiries(inquiries);
};

const handleInquiriesUpdate = (entries = []) => {
  rawInquiries = entries.filter((entry) => entry && typeof entry === "object");
  refreshInquiries();
};

const handleInquiryDelete = async (entry) => {
  const targetId = entry?.id ? String(entry.id).trim() : "";
  if (!targetId) return;
  try {
    await deleteInquiryForm(targetId);
  } catch (error) {
    console.error("Unable to delete inquiry", error);
    window.alert("Unable to delete inquiry. Please try again.");
  }
};

const buildImagePayload = async (plan) => {
  if (!plan) {
    return {
      images: [],
      removals: []
    };
  }

  const orderEntries = Array.isArray(plan.order) ? plan.order : [];
  const uploads = await uploadListingImages(plan.uploads ?? []);
  const images = [];

  orderEntries.forEach((item) => {
    if (item.kind === "existing") {
      if (item.url) {
        images.push(item.url);
      }
    } else if (item.kind === "upload") {
      const uploaded = uploads.get(item.id);
      if (uploaded) {
        images.push(uploaded);
      }
    }
  });

  return {
    images,
    removals: plan.removals ?? []
  };
};

const handleArticleSubmit = async (payload) => {
  if (!payload?.title) return;
  const { id, createdAt, imagesPlan, ...rest } = payload;

  if (rest.sold) {
    rest.reserved = false;
  }

  const targetId = id || editingArticle?.id || "";

  const { images, removals } = await buildImagePayload(imagesPlan);

  rest.images = images;
  rest.displayOrder = editingArticle?.displayOrder ?? Number.MAX_SAFE_INTEGER;

  let nextArticles = articles;

  if (targetId) {
    const updated = {
      ...editingArticle,
      ...rest,
      createdAt: createdAt || editingArticle?.createdAt || null
    };
    nextArticles = await updateArticle(targetId, updated);
  } else {
    nextArticles = await appendArticle(rest);
  }

  if (removals.length) {
    await removeListingImages(removals);
  }

  articles = nextArticles;
  editingArticle = null;
  renderScene();
};

const handleStartCreate = () => {
  editingArticle = null;
  prepareCreateForm();
};

const handleEditRequest = (article) => {
  if (!article?.id) return;
  editingArticle = { ...article };
  prepareEditForm(article);
};

const handleMoveListing = async (articleId, direction) => {
  if (!articleId || !Number.isInteger(direction) || direction === 0) return;
  const ordered = sortArticles(articles);
  const currentIndex = ordered.findIndex((entry) => entry.id === articleId);
  if (currentIndex < 0) return;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= ordered.length) return;

  const reordered = [...ordered];
  const [moved] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, moved);

  const orderedIds = reordered.map((entry) => entry.id);

  try {
    articles = await reorderArticles(orderedIds);
    renderScene();
  } catch (error) {
    console.error("Unable to reorder listings", error);
  }
};

const handleDeleteRequest = async (article) => {
  const targetId = article?.id;
  if (!targetId) return;
  closeDetailPanel();
  editingArticle = null;
  try {
    const removalPaths = Array.isArray(article?.images)
      ? article.images
          .map((entry) => {
            if (typeof entry === "string") return entry;
            if (entry && typeof entry === "object") {
              return entry.path || entry.url || "";
            }
            return "";
          })
          .filter((value) => typeof value === "string" && value.trim().length)
      : [];
    articles = await deleteArticle(targetId);
    if (removalPaths.length) {
      await removeListingImages(removalPaths);
    }
    renderScene();
  } catch (error) {
    console.error("Unable to delete listing", error);
  }
};

const hydrate = async () => {
  if (bootstrapped) return;
  try {
    articles = await loadArticles();
  } catch (error) {
    console.error("Unable to load articles", error);
    articles = [];
  }
  renderScene();
  bootstrapped = true;
};

const hydrateInquiries = async () => {
  try {
    const initial = await loadInquiryForms();
    handleInquiriesUpdate(initial);
  } catch (error) {
    console.error("Unable to load inquiry forms", error);
    inquiries = [];
    renderInquiries(inquiries);
  }
};

const start = async () => {
  initUI({
    onPanelClose: () => {
      editingArticle = null;
    },
    onFormSubmit: handleArticleSubmit,
    onEditRequest: handleEditRequest,
    onDeleteRequest: handleDeleteRequest,
    onStartCreate: handleStartCreate,
    onMoveListing: handleMoveListing,
    onDeleteInquiry: handleInquiryDelete
  });
  renderInquiries(inquiries);
  await hydrate();
  await hydrateInquiries();
  unsubscribe = subscribeToArticles((latest) => {
    articles = [...latest];
    renderScene();
    refreshInquiries();
  });
  unsubscribeInquiries = subscribeToInquiryForms((latest) => {
    handleInquiriesUpdate(latest);
  });
};

start().catch((error) => {
  console.error("Failed to start application", error);
});

window.addEventListener("beforeunload", () => {
  unsubscribe?.();
  unsubscribe = null;
  unsubscribeInquiries?.();
  unsubscribeInquiries = null;
});
