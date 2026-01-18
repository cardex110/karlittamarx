import { loadArticles, subscribeToArticles, submitInquiryForm } from "./storage.js";

const elements = {
  grid: document.getElementById("listing-grid"),
  detailPanel: document.getElementById("detail-panel"),
  detailContent: document.getElementById("detail-content"),
  closeDetailPanel: document.getElementById("close-detail-panel"),
  inquiryPanel: document.getElementById("inquiry-panel"),
  closeInquiryPanel: document.getElementById("close-inquiry-panel"),
  inquiryForm: document.getElementById("inquiry-form"),
  inquiryListing: document.getElementById("inquiry-listing"),
  inquiryName: document.getElementById("inquiry-name"),
  inquiryEmail: document.getElementById("inquiry-email"),
  inquiryPhone: document.getElementById("inquiry-phone"),
  inquiryNotes: document.getElementById("inquiry-notes"),
  inquiryMessage: document.getElementById("inquiry-message"),
  inquirySubmit: document.getElementById("inquiry-submit")
};

let unsubscribe = null;
let articles = [];
let lastTrigger = null;
let lastInquiryTrigger = null;
let activeInquiry = null;

const DIAMOND_SRC = new URL("../assets/images/diamond.gif", import.meta.url).href;

const AUTH_CLASSES = {
  sold: "is-sold",
  reserved: "is-reserved"
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const normalizePhoneNumber = (value) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length !== 10) return "";
  return digits;
};

const formatPriceDisplay = (price, currency) => {
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

const sortArticles = (items) =>
  [...items].sort((a, b) => {
    const normalizeOrder = (value) => (Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER);
    const diff = normalizeOrder(a.displayOrder) - normalizeOrder(b.displayOrder);
    if (diff !== 0) return diff;
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

const getGalleryContext = (article) => {
  const list = Array.isArray(article?.images)
    ? article.images
        .map((entry) => {
          if (!entry) return null;
          if (typeof entry === "string") {
            const url = entry.trim();
            return url ? { url } : null;
          }
          if (typeof entry === "object") {
            const url = String(entry.url ?? entry.path ?? "").trim();
            return url ? { url } : null;
          }
          return null;
        })
        .filter(Boolean)
    : [];

  if (!list.length && typeof article?.image === "string") {
    const fallbackUrl = article.image.trim();
    if (fallbackUrl) {
      list.push({ url: fallbackUrl });
    }
  }

  return {
    list,
    cover: list[0] ?? null,
    index: 0
  };
};

const closeDetailPanel = () => {
  if (!elements.detailPanel) return;
  elements.detailPanel.classList.remove("is-open");
  elements.detailPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-modal-open");
  if (lastTrigger) {
    lastTrigger.focus({ preventScroll: true });
    lastTrigger = null;
  }
};

const setInquiryMessage = (text, kind) => {
  if (!elements.inquiryMessage) return;
  if (!text) {
    elements.inquiryMessage.hidden = true;
    elements.inquiryMessage.textContent = "";
    elements.inquiryMessage.classList.remove("is-success", "is-error");
    return;
  }
  elements.inquiryMessage.hidden = false;
  elements.inquiryMessage.textContent = text;
  elements.inquiryMessage.classList.remove("is-success", "is-error");
  if (kind === "success") {
    elements.inquiryMessage.classList.add("is-success");
  } else if (kind === "error") {
    elements.inquiryMessage.classList.add("is-error");
  }
};

const closeInquiryPanel = () => {
  if (!elements.inquiryPanel) return;
  elements.inquiryPanel.classList.remove("is-open");
  elements.inquiryPanel.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-modal-open");
  setInquiryMessage("", null);
  activeInquiry = null;
  if (elements.inquiryForm) {
    elements.inquiryForm.reset();
  }
  if (lastInquiryTrigger) {
    lastInquiryTrigger.focus({ preventScroll: true });
    lastInquiryTrigger = null;
  }
};

const openInquiryPanel = (article, trigger) => {
  if (!elements.inquiryPanel) return;
  closeDetailPanel();
  activeInquiry = article;
  lastInquiryTrigger = trigger instanceof HTMLElement ? trigger : null;
  setInquiryMessage("", null);
  if (elements.inquiryListing) {
    const listingTitle = article?.title ? String(article.title).trim() : "closet listing";
    elements.inquiryListing.textContent = `for ${listingTitle}`;
  }
  if (elements.inquiryForm && !elements.inquiryName?.value) {
    elements.inquiryForm.reset();
  }
  elements.inquiryPanel.classList.add("is-open");
  elements.inquiryPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-modal-open");
  setTimeout(() => {
    elements.inquiryName?.focus({ preventScroll: true });
  }, 0);
};

const openDetailPanel = (article, trigger) => {
  if (!elements.detailPanel || !elements.detailContent) return;
  elements.detailPanel.classList.add("is-open");
  elements.detailPanel.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-modal-open");
  lastTrigger = trigger instanceof HTMLElement ? trigger : null;
  renderDetailPanel(article);
  elements.closeDetailPanel?.focus({ preventScroll: true });
};

const renderDetailPanel = (article) => {
  if (!elements.detailContent) return;
  const {
    title,
    size,
    price,
    currency,
    description,
    sold,
    reserved
  } = article;

  const safeTitle = title || "closet listing";
  const priceDisplay = formatPriceDisplay(price, currency);
  const status = sold ? "sold" : reserved ? "reserved" : "";
  const { list: galleryImages, cover } = getGalleryContext(article);

  const fragment = document.createDocumentFragment();

  if (cover?.url) {
    const media = document.createElement("figure");
    media.className = "detail-panel__media";

    const mainImage = document.createElement("img");
    mainImage.className = "detail-panel__image";
    mainImage.src = cover.url;
    mainImage.alt = `${safeTitle} gallery preview`;
    media.append(mainImage);

    if (galleryImages.length > 1) {
      const thumbList = document.createElement("div");
      thumbList.className = "detail-panel__thumbs";

      galleryImages.forEach((entry, index) => {
        if (!entry?.url) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "detail-panel__thumb";
        if (index === 0) button.classList.add("is-active");

        const thumbImage = document.createElement("img");
        thumbImage.src = entry.url;
        thumbImage.alt = `${safeTitle} thumbnail ${index + 1}`;
        thumbImage.loading = "lazy";
        button.append(thumbImage);

        button.addEventListener("click", () => {
          mainImage.src = entry.url;
          mainImage.alt = `${safeTitle} gallery preview ${index + 1}`;
          thumbList.querySelectorAll(".detail-panel__thumb").forEach((node) => {
            node.classList.toggle("is-active", node === button);
          });
        });

        thumbList.append(button);
      });

      media.append(thumbList);
    }

    fragment.append(media);

    const diamond = document.createElement("img");
    diamond.className = "detail-panel__diamond";
    diamond.src = DIAMOND_SRC;
    diamond.alt = "";
    diamond.setAttribute("aria-hidden", "true");
    fragment.append(diamond);
  }

  const header = document.createElement("header");
  header.className = "detail-panel__header";

  const titleEl = document.createElement("h2");
  titleEl.className = "detail-panel__title";
  titleEl.id = "detail-title";
  titleEl.textContent = safeTitle;

  const titleGroup = document.createElement("div");
  titleGroup.className = "detail-panel__title-group";
  titleGroup.append(titleEl);

  if (priceDisplay) {
    const priceEl = document.createElement("p");
    priceEl.className = "detail-panel__price";
    priceEl.textContent = priceDisplay;
    titleGroup.append(priceEl);
  }

  header.append(titleGroup);

  if (status) {
    const meta = document.createElement("p");
    meta.className = "detail-panel__meta";

    const statusSpan = document.createElement("span");
    statusSpan.className = "detail-panel__status";
    statusSpan.textContent = status;
    if (status === "sold" || status === "reserved") {
      statusSpan.classList.add(`detail-panel__status--${status}`);
    }
    meta.append(statusSpan);

    header.append(meta);
  }

  fragment.append(header);

  if (size) {
    const spec = document.createElement("p");
    spec.className = "detail-panel__spec";
    spec.textContent = `SIZE: ${size}`;
    fragment.append(spec);
  }

  const blurb = document.createElement("p");
  blurb.className = "detail-panel__description";
  blurb.textContent = description || "no additional notes—scope the photos above.";
  fragment.append(blurb);

  const inquiryButton = document.createElement("button");
  inquiryButton.type = "button";
  inquiryButton.className = "detail-panel__inquire";
  inquiryButton.textContent = "inquire";
  inquiryButton.addEventListener("click", () => {
    openInquiryPanel(article, inquiryButton);
  });
  fragment.append(inquiryButton);

  elements.detailContent.innerHTML = "";
  elements.detailContent.append(fragment);
};

const buildCard = (article) => {
  const {
    title,
    price,
    currency,
    size,
    sold,
    reserved
  } = article;

  const safeTitle = title || "closet listing";
  const card = document.createElement("article");
  card.className = "card";
  if (sold) card.classList.add(AUTH_CLASSES.sold);
  if (!sold && reserved) card.classList.add(AUTH_CLASSES.reserved);

  const { list: galleryImages, cover } = getGalleryContext(article);
  const status = sold ? "sold" : reserved ? "reserved" : "";

  if (cover?.url) {
    const mediaWrap = document.createElement("div");
    mediaWrap.className = "card__media";

    const media = document.createElement("img");
    media.className = "card__image";
    media.src = cover.url;
    media.alt = `${safeTitle} preview`;
    media.loading = "lazy";
    mediaWrap.append(media);

    if (galleryImages.length > 1) {
      const counter = document.createElement("span");
      counter.className = "card__image-count";
      counter.textContent = `${galleryImages.length}`;
      mediaWrap.append(counter);
    }

    card.append(mediaWrap);

    const diamond = document.createElement("img");
    diamond.className = "card__diamond";
    diamond.src = DIAMOND_SRC;
    diamond.alt = "";
    diamond.setAttribute("aria-hidden", "true");
    card.append(diamond);
  }

  const titleEl = document.createElement("h3");
  titleEl.className = "card__title";
  titleEl.textContent = safeTitle;
  card.append(titleEl);

  const cardPrice = formatPriceDisplay(price, currency);
  if (cardPrice) {
    const priceNode = document.createElement("p");
    priceNode.className = "card__price";
    priceNode.textContent = cardPrice;
    card.append(priceNode);
  }

  if (size) {
    const info = document.createElement("p");
    info.className = "card__info";
    info.textContent = `SIZE: ${size}`;
    card.append(info);
  }

  if (status) {
    const meta = document.createElement("div");
    meta.className = "card__meta";

    const statusSpan = document.createElement("span");
    statusSpan.className = "card__status";
    statusSpan.textContent = status;
    if (status === "sold" || status === "reserved") {
      statusSpan.classList.add(`card__status--${status}`);
    }
    meta.append(statusSpan);

    card.append(meta);
  }

  const inquireButton = document.createElement("button");
  inquireButton.type = "button";
  inquireButton.className = "card__inquire";
  inquireButton.textContent = "inquire";
  inquireButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openInquiryPanel(article, inquireButton);
  });
  card.append(inquireButton);

  card.addEventListener("click", () => {
    openDetailPanel(article, card);
  });

  return card;
};

const handleInquirySubmit = async (event) => {
  event.preventDefault();

  if (!elements.inquiryForm) return;
  const nameRaw = elements.inquiryName?.value ?? "";
  const emailRaw = elements.inquiryEmail?.value ?? "";
  const phoneRaw = elements.inquiryPhone?.value ?? "";
  const notesRaw = elements.inquiryNotes?.value ?? "";
  const listingId = activeInquiry?.id ?? "";
  const listingTitle = activeInquiry?.title ?? "";
  const listingPrice = activeInquiry?.price ?? "";
  const listingCurrency = activeInquiry?.currency ?? "";
  const listingPriceDisplay = formatPriceDisplay(listingPrice, listingCurrency);

  const name = nameRaw.trim();
  const email = emailRaw.trim().toLowerCase();
  const phone = phoneRaw.trim();
  const message = notesRaw.trim();

  const requiredFields = [
    { value: name, element: elements.inquiryName },
    { value: email, element: elements.inquiryEmail },
    { value: phone, element: elements.inquiryPhone }
  ];

  const missingField = requiredFields.find((entry) => !entry.value);
  if (missingField) {
    setInquiryMessage("please complete all required fields", "error");
    missingField.element?.focus({ preventScroll: true });
    return;
  }

  if (!EMAIL_PATTERN.test(email)) {
    setInquiryMessage("enter a valid email", "error");
    elements.inquiryEmail?.focus({ preventScroll: true });
    return;
  }

  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) {
    setInquiryMessage("please enter valid 10 digit phone number", "error");
    elements.inquiryPhone?.focus({ preventScroll: true });
    return;
  }

  if (elements.inquiryEmail) {
    elements.inquiryEmail.value = email;
  }
  if (elements.inquiryPhone) {
    elements.inquiryPhone.value = normalizedPhone;
  }

  if (!elements.inquirySubmit) {
    return;
  }

  elements.inquirySubmit.disabled = true;
  setInquiryMessage("", null);

  try {
    await submitInquiryForm({
      name,
      email,
      phone: normalizedPhone,
      message: message || null,
      listingId,
      listingTitle,
      listingPrice,
      listingCurrency,
      listingPriceDisplay
    });
    elements.inquiryForm.reset();
    setInquiryMessage("inquiry sent", "success");
  } catch (error) {
    console.error("Unable to submit inquiry", error);
    setInquiryMessage("something went wrong", "error");
  } finally {
    elements.inquirySubmit.disabled = false;
  }
};

const renderEmptyState = () => {
  if (!elements.grid) return;
  elements.grid.innerHTML = "";
  const wrapper = document.createElement("article");
  wrapper.className = "card listings__empty";
  wrapper.setAttribute("aria-live", "polite");

  const title = document.createElement("p");
  title.className = "card__title";
  title.textContent = "no listings available";

  const copy = document.createElement("p");
  copy.className = "card__description";
  copy.textContent = "Follow the links in my Linktree to stay updated.";

  wrapper.append(title, copy);
  elements.grid.append(wrapper);
};

const renderListings = (items = []) => {
  if (!elements.grid) return;
  if (!items.length) {
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((article) => {
    fragment.append(buildCard(article));
  });

  elements.grid.innerHTML = "";
  elements.grid.append(fragment);
};

const handleArticlesUpdate = (next) => {
  articles = sortArticles(next);
  renderListings(articles);
};

const hydrate = async () => {
  try {
    const initial = await loadArticles();
    handleArticlesUpdate(initial);
  } catch (error) {
    console.error("Unable to load listings", error);
    renderListings([]);
  }

  unsubscribe = subscribeToArticles(handleArticlesUpdate);
};

const attachGlobalListeners = () => {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (elements.inquiryPanel?.classList.contains("is-open")) {
        closeInquiryPanel();
        return;
      }
      closeDetailPanel();
    }
  });

  if (elements.closeDetailPanel) {
    elements.closeDetailPanel.addEventListener("click", () => {
      closeDetailPanel();
    });
  }

  if (elements.detailPanel) {
    elements.detailPanel.addEventListener("click", (event) => {
      if (event.target === elements.detailPanel) {
        closeDetailPanel();
      }
    });
  }

  if (elements.closeInquiryPanel) {
    elements.closeInquiryPanel.addEventListener("click", () => {
      closeInquiryPanel();
    });
  }

  if (elements.inquiryPanel) {
    elements.inquiryPanel.addEventListener("click", (event) => {
      if (event.target === elements.inquiryPanel) {
        closeInquiryPanel();
      }
    });
  }

  if (elements.inquiryForm) {
    elements.inquiryForm.addEventListener("submit", (event) => {
      handleInquirySubmit(event);
    });
  }
};

attachGlobalListeners();
hydrate();

window.addEventListener("beforeunload", () => {
  unsubscribe?.();
  unsubscribe = null;
});
