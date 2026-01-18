const elements = {
  grid: document.getElementById("listing-grid"),
  addPanel: document.getElementById("add-panel"),
  openPanel: document.getElementById("open-add-panel"),
  closePanel: document.getElementById("close-add-panel"),
  form: document.getElementById("add-form"),
  formId: document.getElementById("field-id"),
  formExistingImages: document.getElementById("field-existing-images"),
  formFileInput: document.getElementById("field-image-file"),
  formCurrency: document.getElementById("field-currency"),
  imagePreviews: document.getElementById("image-previews"),
  footerCount: document.getElementById("footer-count"),
  detailPanel: document.getElementById("detail-panel"),
  closeDetailPanel: document.getElementById("close-detail-panel"),
  detailContent: document.getElementById("detail-content"),
  inquiriesPanel: document.getElementById("inquiries-panel"),
  closeInquiriesPanel: document.getElementById("close-inquiries-panel"),
  openInquiriesPanel: document.getElementById("open-inquiries-panel"),
  inquiriesContent: document.getElementById("inquiries-content"),
  inquiriesSummary: document.getElementById("inquiries-summary")
};

let submitButtonOriginalText = "save listing";
let lastDetailTrigger = null;
let lastInquiriesTrigger = null;

const DIAMOND_SRC = new URL("../assets/images/diamond.gif", import.meta.url).href;

const listeners = {
  onPanelOpen: null,
  onPanelClose: null,
  onFormSubmit: null,
  onEditRequest: null,
  onDeleteRequest: null,
  onStartCreate: null,
  onMoveListing: null,
  onDeleteInquiry: null
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

const formatTimestamp = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const MAX_IMAGE_UPLOADS = 8;
const imageState = {
  items: []
};

const generateId = (prefix) =>
  `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;

const releasePreviewUrl = (item) => {
  if (item?.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
};

const persistExistingImagesField = () => {
  if (!elements.formExistingImages) return;
  const existing = imageState.items
    .filter((item) => item.type === "existing" && !item.removed)
    .map((item) => item.url)
    .filter((url) => typeof url === "string" && url.trim().length);
  elements.formExistingImages.value = JSON.stringify(existing);
};

const renderImagePreviews = () => {
  const container = elements.imagePreviews;
  if (!container) return;
  persistExistingImagesField();

  container.innerHTML = "";
  const activeItems = imageState.items.filter((item) => !item.removed);

  if (!activeItems.length) {
    const empty = document.createElement("p");
    empty.className = "image-previews__empty";
    empty.textContent = "No images added yet.";
    container.append(empty);
    return;
  }

  activeItems.forEach((item, index) => {
    const preview = document.createElement("div");
    preview.className = "image-previews__item";
    preview.dataset.imageId = item.id;

    const thumbnail = document.createElement("img");
    thumbnail.src = item.previewUrl || item.url;
    thumbnail.alt = `gallery image ${index + 1}`;
    thumbnail.loading = "lazy";
    preview.append(thumbnail);

    const actions = document.createElement("div");
    actions.className = "image-previews__actions";

    const moveLeft = document.createElement("button");
    moveLeft.type = "button";
    moveLeft.className = "image-previews__action";
    moveLeft.dataset.action = "move-left";
    moveLeft.textContent = "move left";
    moveLeft.disabled = index === 0;

    const moveRight = document.createElement("button");
    moveRight.type = "button";
    moveRight.className = "image-previews__action";
    moveRight.dataset.action = "move-right";
    moveRight.textContent = "move right";
    moveRight.disabled = index === activeItems.length - 1;

    actions.append(moveLeft, moveRight);

    if (index === 0) {
      preview.classList.add("is-cover");
      const badge = document.createElement("span");
      badge.className = "image-previews__label";
      badge.textContent = "cover photo";
      actions.append(badge);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "image-previews__action";
    removeButton.dataset.action = "remove";
    removeButton.textContent = "remove";
    actions.append(removeButton);

    preview.append(actions);
    container.append(preview);
  });
};

const resetImageState = () => {
  imageState.items.forEach(releasePreviewUrl);
  imageState.items = [];
  renderImagePreviews();
};

const moveImageBy = (imageId, delta) => {
  if (!imageId || !Number.isInteger(delta) || delta === 0) return;
  const activeItems = imageState.items.filter((item) => !item.removed);
  const currentIndex = activeItems.findIndex((item) => item.id === imageId);
  if (currentIndex < 0) return;

  const targetIndex = Math.max(0, Math.min(currentIndex + delta, activeItems.length - 1));
  if (currentIndex === targetIndex) return;

  const order = [...activeItems];
  const [moved] = order.splice(currentIndex, 1);
  order.splice(targetIndex, 0, moved);

  const removedItems = imageState.items.filter((item) => item.removed);
  imageState.items = [...order, ...removedItems];

  renderImagePreviews();
};

const hydrateImagesFromArticle = (article) => {
  resetImageState();
  const list = Array.isArray(article?.images) ? article.images : [];
  const coerceEntry = (entry) => {
    if (!entry) return null;
    if (typeof entry === "string") {
      const url = entry.trim();
      return url ? { url } : null;
    }
    if (typeof entry === "object") {
      const url = String(entry.url ?? entry.path ?? "").trim();
      if (!url) return null;
      const path = String(entry.path ?? "").trim();
      return { url, path };
    }
    return null;
  };

  list.forEach((entry) => {
    const resolved = coerceEntry(entry);
    if (!resolved) return;
    imageState.items.push({
      id: generateId("existing"),
      type: "existing",
      url: resolved.url,
      path: resolved.path ?? "",
      removed: false
    });
  });

  if (!imageState.items.length) {
    const fallbackUrl = typeof article?.image === "string" ? article.image.trim() : "";
    if (fallbackUrl) {
      imageState.items.push({
        id: generateId("existing"),
        type: "existing",
        url: fallbackUrl,
        path: "",
        removed: false
      });
    }
  }

  renderImagePreviews();
};

const addUploadFiles = (fileList) => {
  if (!fileList?.length) return;
  const currentCount = imageState.items.filter((item) => !item.removed).length;
  const availableSlots = Math.max(0, MAX_IMAGE_UPLOADS - currentCount);
  if (!availableSlots) {
    console.warn(`Maximum of ${MAX_IMAGE_UPLOADS} images reached.`);
    return;
  }

  Array.from(fileList)
    .slice(0, availableSlots)
    .forEach((file) => {
      if (!(file instanceof File)) return;
      const id = generateId("upload");
      const previewUrl = URL.createObjectURL(file);
      imageState.items.push({
        id,
        type: "upload",
        file,
        previewUrl,
        removed: false
      });
    });

  if (elements.formFileInput) {
    elements.formFileInput.value = "";
  }

  renderImagePreviews();
};

const removeImageById = (id) => {
  const index = imageState.items.findIndex((item) => item.id === id);
  if (index === -1) return;
  const target = imageState.items[index];

  if (target.type === "existing") {
    imageState.items[index] = { ...target, removed: true };
  } else {
    releasePreviewUrl(target);
    imageState.items.splice(index, 1);
  }

  renderImagePreviews();
};

const buildImagesPlan = () => {
  const activeItems = imageState.items.filter((item) => !item.removed);
  const uploads = [];
  const order = [];

  activeItems.forEach((item) => {
    if (item.type === "existing") {
      order.push({
        kind: "existing",
        id: item.id,
        url: item.url
      });
    } else if (item.type === "upload") {
      uploads.push({ id: item.id, file: item.file });
      order.push({ kind: "upload", id: item.id });
    }
  });

  const removals = imageState.items
    .filter((item) => item.type === "existing" && item.removed)
    .map((item) => item.path || item.url)
    .filter((value) => typeof value === "string" && value.trim().length);

  return { order, uploads, removals };
};

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

  const index = 0;

  return {
    list,
    cover: list[index] ?? null,
    index
  };
};

const getSubmitButton = () => elements.form?.querySelector("button[type='submit']");

const setSubmitLabel = (value) => {
  const submitButton = getSubmitButton();
  if (submitButton) {
    submitButton.textContent = value;
  }
};

const clearFormMetadata = () => {
  if (elements.formId) elements.formId.value = "";
  if (elements.formExistingImage) elements.formExistingImage.value = "";
  if (elements.form) {
    elements.form.dataset.mode = "create";
    delete elements.form.dataset.createdAt;
  }
};

const resetFormFields = () => {
  elements.form?.reset();
  clearFormMetadata();
  setSubmitLabel(submitButtonOriginalText);
  const soldField = elements.form?.querySelector("#field-sold");
  const reservedField = elements.form?.querySelector("#field-reserved");
  if (soldField instanceof HTMLInputElement) soldField.checked = false;
  if (reservedField instanceof HTMLInputElement) reservedField.checked = false;
  if (elements.formExistingImages) {
    elements.formExistingImages.value = "[]";
  }
  if (elements.formCurrency) {
    elements.formCurrency.value = "USD";
  }
  resetImageState();
};

const populateForm = (article) => {
  if (!elements.form) return;
  const assign = (selector, value) => {
    const field = elements.form?.querySelector(selector);
    if (field && "value" in field) field.value = value ?? "";
  };

  assign("#field-title", article?.title ?? "");
  assign("#field-size", article?.size ?? "");
  assign("#field-price", article?.price ?? "");
  assign("#field-currency", (article?.currency || "USD").toUpperCase());
  assign("#field-description", article?.description ?? "");

  const soldField = elements.form.querySelector("#field-sold");
  if (soldField instanceof HTMLInputElement) {
    soldField.checked = Boolean(article?.sold);
  }

  const reservedField = elements.form.querySelector("#field-reserved");
  if (reservedField instanceof HTMLInputElement) {
    reservedField.checked = Boolean(article?.reserved) && !article?.sold;
  }

  if (elements.formId) elements.formId.value = article?.id ?? "";
  hydrateImagesFromArticle(article);
  if (elements.form) {
    elements.form.dataset.mode = article?.id ? "edit" : "create";
    if (article?.createdAt) {
      elements.form.dataset.createdAt = article.createdAt;
    } else {
      delete elements.form.dataset.createdAt;
    }
  }
};

export const prepareCreateForm = () => {
  resetFormFields();
  toggleDetailPanel(false);
  toggleAddPanel(true);
};

export const prepareEditForm = (article) => {
  populateForm(article);
  setSubmitLabel("update listing");
  toggleDetailPanel(false);
  toggleAddPanel(true);
};

export const closeDetailPanel = () => toggleDetailPanel(false);

const collectFormData = async (form) => {
  const formData = new FormData(form);
  const id = String(formData.get("id") ?? "").trim();

  const title = String(formData.get("title") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  if (!size) {
    throw new Error("Size is required.");
  }

  const rawPrice = String(formData.get("price") ?? "").trim();
  const pricePattern = /^\d+(\.\d{1,2})?$/;
  const normalizedPriceInput = rawPrice.replace(/,/g, "");
  if (!normalizedPriceInput || !pricePattern.test(normalizedPriceInput)) {
    throw new Error("Enter a valid price such as 100 or 100.00.");
  }
  const parsedPrice = Number(normalizedPriceInput);
  if (!Number.isFinite(parsedPrice)) {
    throw new Error("Price must be a number.");
  }
  const price = parsedPrice.toFixed(2);

  const currency = String(formData.get("currency") ?? "USD").trim().toUpperCase() || "USD";

  const imagesPlan = buildImagesPlan();
  if (!imagesPlan.order.length) {
    throw new Error("Add at least one image before saving.");
  }

  return {
    id,
      title,
      size,
      price,
      currency,
    description: String(formData.get("description") ?? "").trim(),
    sold: formData.get("sold") === "true",
    reserved: formData.get("reserved") === "true",
    createdAt: form.dataset.createdAt ?? "",
      imagesPlan
  };
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

const toggleDetailPanel = (shouldOpen) => {
  if (!elements.detailPanel) return;
  const open = shouldOpen === true;
  elements.detailPanel.classList.toggle("is-open", open);
  elements.detailPanel.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("is-modal-open", open);
  if (open) {
    elements.closeDetailPanel?.focus({ preventScroll: true });
  } else {
    if (lastDetailTrigger) {
      lastDetailTrigger.focus({ preventScroll: true });
    }
    lastDetailTrigger = null;
  }
};

const toggleInquiriesPanel = (shouldOpen) => {
  if (!elements.inquiriesPanel) return;
  const open = shouldOpen === true;
  const wasOpen = elements.inquiriesPanel.classList.contains("is-open");
  elements.inquiriesPanel.classList.toggle("is-open", open);
  elements.inquiriesPanel.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("is-modal-open", open);

  if (open && !wasOpen) {
    lastInquiriesTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    elements.inquiriesPanel.querySelector("button, a, input, [tabindex]")?.focus({ preventScroll: true });
  }

  if (!open && wasOpen) {
    const fallback = lastInquiriesTrigger ?? elements.openInquiriesPanel;
    fallback?.focus({ preventScroll: true });
    lastInquiriesTrigger = null;
  }
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
    reserved,
    createdAt
  } = article;

  const safeTitle = title || "closet listing";
  const priceDisplay = formatPriceDisplay(price, currency);
  const status = sold ? "sold" : reserved ? "reserved" : "";
  const { list: galleryImages, cover, index: coverIndex } = getGalleryContext(article);

  const fragment = document.createDocumentFragment();

  if (cover?.url) {
    const media = document.createElement("figure");
    media.className = "detail-panel__media";

    const mainImage = document.createElement("img");
    mainImage.className = "detail-panel__image";
    mainImage.src = cover.url;
    mainImage.alt = `${safeTitle} gallery preview`;
    mainImage.dataset.activeIndex = String(coverIndex);
    media.append(mainImage);

    if (galleryImages.length > 1) {
      const thumbList = document.createElement("div");
      thumbList.className = "detail-panel__thumbs";

      galleryImages.forEach((entry, index) => {
        if (!entry?.url) return;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "detail-panel__thumb";
        if (index === coverIndex) {
          button.classList.add("is-active");
        }

        const thumbImage = document.createElement("img");
        thumbImage.src = entry.url;
        thumbImage.alt = `${safeTitle} thumbnail ${index + 1}`;
        thumbImage.loading = "lazy";
        button.append(thumbImage);

        button.addEventListener("click", () => {
          mainImage.src = entry.url;
          mainImage.dataset.activeIndex = String(index);
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

  const specSegments = [];
  if (size) specSegments.push(`SIZE: ${size}`);

  if (specSegments.length) {
    const specs = document.createElement("p");
    specs.className = "detail-panel__spec";
    specs.textContent = specSegments.join("  ");
    fragment.append(specs);
  }

  const blurb = document.createElement("p");
  blurb.className = "detail-panel__description";
  blurb.textContent = description || "no additional notes—scope the photos above.";
  fragment.append(blurb);

  if (listeners.onEditRequest || listeners.onDeleteRequest) {
    const controls = document.createElement("div");
    controls.className = "detail-panel__controls";

    if (listeners.onEditRequest) {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "detail-panel__button";
      editButton.textContent = "edit listing";
      editButton.addEventListener("click", () => {
        toggleDetailPanel(false);
        listeners.onEditRequest?.(article);
      });
      controls.append(editButton);
    }

    if (listeners.onDeleteRequest) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "detail-panel__button detail-panel__button--delete";
      deleteButton.textContent = "delete listing";
      deleteButton.addEventListener("click", () => {
        toggleDetailPanel(false);
        listeners.onDeleteRequest?.(article);
      });
      controls.append(deleteButton);
    }

    if (controls.childElementCount) {
      fragment.append(controls);
    }
  }

  elements.detailContent.innerHTML = "";
  elements.detailContent.append(fragment);
};

const openDetailPanel = (article, trigger) => {
  if (trigger instanceof HTMLElement) {
    lastDetailTrigger = trigger;
  } else {
    lastDetailTrigger = null;
  }
  if (elements.addPanel?.classList.contains("is-open")) {
    toggleAddPanel(false);
  }
  renderDetailPanel(article);
  toggleDetailPanel(true);
};

const buildCard = (article, index = 0, total = 0) => {
  const {
    id,
    title,
    size,
    price,
    currency,
    description,
    sold,
    reserved
  } = article;

    const { list: galleryImages, cover } = getGalleryContext(article);

  const status = sold ? "sold" : reserved ? "reserved" : "";
  const safeTitle = title || "closet listing";

  const card = document.createElement("article");
  card.className = "card";
  if (sold) card.classList.add("is-sold");
  else if (reserved) card.classList.add("is-reserved");
  card.dataset.articleId = id;

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

  const blurb = document.createElement("p");
  blurb.className = "card__description";
  blurb.textContent = description || "tap view listing for full pics + notes.";

  const controls = document.createElement("div");
  controls.className = "card__controls";

  if (listeners.onMoveListing) {
    const moveUp = document.createElement("button");
    moveUp.type = "button";
    moveUp.className = "card__button";
    moveUp.textContent = "move up";
    moveUp.disabled = index <= 0;
    moveUp.addEventListener("click", (event) => {
      event.stopPropagation();
      listeners.onMoveListing?.(article.id, -1);
    });

    const moveDown = document.createElement("button");
    moveDown.type = "button";
    moveDown.className = "card__button";
    moveDown.textContent = "move down";
    moveDown.disabled = index >= total - 1;
    moveDown.addEventListener("click", (event) => {
      event.stopPropagation();
      listeners.onMoveListing?.(article.id, 1);
    });

    controls.append(moveUp, moveDown);
  }

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "card__button";
  editButton.textContent = "edit";
  editButton.addEventListener("click", (event) => {
    event.stopPropagation();
    listeners.onEditRequest?.(article);
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "card__button card__button--delete";
  deleteButton.textContent = "delete";
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    listeners.onDeleteRequest?.(article);
  });

  controls.append(editButton, deleteButton);

  card.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      return;
    }
    openDetailPanel(article, card);
  });
  card.append(blurb, controls);
  return card;
};

const handleKeydown = (event) => {
  if (event.key === "Escape") {
    if (elements.inquiriesPanel?.classList.contains("is-open")) {
      toggleInquiriesPanel(false);
      return;
    }
    if (elements.detailPanel?.classList.contains("is-open")) {
      toggleDetailPanel(false);
      return;
    }
    if (elements.addPanel?.classList.contains("is-open")) {
      resetFormFields();
      toggleAddPanel(false);
    }
  }
};

document.addEventListener("keydown", handleKeydown);

export const initUI = ({
  onPanelOpen,
  onPanelClose,
  onFormSubmit,
  onEditRequest,
  onDeleteRequest,
  onStartCreate,
  onMoveListing,
  onDeleteInquiry
} = {}) => {
  listeners.onPanelOpen = onPanelOpen ?? null;
  listeners.onPanelClose = onPanelClose ?? null;
  listeners.onFormSubmit = onFormSubmit ?? null;
  listeners.onEditRequest = onEditRequest ?? null;
  listeners.onDeleteRequest = onDeleteRequest ?? null;
  listeners.onStartCreate = onStartCreate ?? null;
  listeners.onMoveListing = onMoveListing ?? null;
  listeners.onDeleteInquiry = onDeleteInquiry ?? null;

  if (elements.openPanel) {
    elements.openPanel.addEventListener("click", () => {
      if (listeners.onStartCreate) {
        listeners.onStartCreate();
      } else {
        prepareCreateForm();
      }
    });
  }

  if (elements.closePanel) {
    elements.closePanel.addEventListener("click", () => {
      resetFormFields();
      toggleAddPanel(false);
    });
  }

  if (elements.openInquiriesPanel) {
    elements.openInquiriesPanel.addEventListener("click", () => {
      toggleDetailPanel(false);
      toggleAddPanel(false);
      toggleInquiriesPanel(true);
    });
  }

  if (elements.closeInquiriesPanel) {
    elements.closeInquiriesPanel.addEventListener("click", () => {
      toggleInquiriesPanel(false);
    });
  }

  if (elements.inquiriesPanel) {
    elements.inquiriesPanel.addEventListener("click", (event) => {
      if (event.target === elements.inquiriesPanel) {
        toggleInquiriesPanel(false);
      }
    });
  }

  if (elements.closeDetailPanel) {
    elements.closeDetailPanel.addEventListener("click", () => {
      toggleDetailPanel(false);
    });
  }

  if (elements.detailPanel) {
    elements.detailPanel.addEventListener("click", (event) => {
      if (event.target === elements.detailPanel) {
        toggleDetailPanel(false);
      }
    });
  }

  if (elements.formFileInput) {
    elements.formFileInput.addEventListener("change", (event) => {
      const files = event.target instanceof HTMLInputElement ? event.target.files : null;
      addUploadFiles(files);
    });
  }

  if (elements.imagePreviews) {
    elements.imagePreviews.addEventListener("click", (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const actionButton = event.target.closest("button[data-action]");
      if (!actionButton) return;
      const action = actionButton.dataset.action;
      const item = actionButton.closest(".image-previews__item");
      const imageId = item?.dataset.imageId;
      if (!imageId) return;

      if (action === "remove") {
        removeImageById(imageId);
      } else if (action === "move-left") {
        moveImageBy(imageId, -1);
      } else if (action === "move-right") {
        moveImageBy(imageId, 1);
      }
    });
  }

  if (elements.form) {
    const submitButton = getSubmitButton();
    if (submitButton) {
      submitButtonOriginalText = submitButton.textContent ?? submitButtonOriginalText;
    }

    elements.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!listeners.onFormSubmit) return;

      const submitControl = getSubmitButton();
      if (submitControl) {
        submitControl.disabled = true;
        submitControl.textContent = "saving...";
      }

      let succeeded = false;
      try {
        const payload = await collectFormData(elements.form);
        await listeners.onFormSubmit(payload);
        succeeded = true;
      } catch (error) {
        console.error("Unable to submit listing", error);
        const message = error instanceof Error ? error.message : "Unable to submit listing.";
        window.alert(message);
      } finally {
        if (submitControl) {
          submitControl.disabled = false;
          submitControl.textContent =
            elements.form.dataset.mode === "edit" ? "update listing" : submitButtonOriginalText;
        }
        if (succeeded) {
          resetFormFields();
          toggleAddPanel(false);
        }
      }
    });
  }
};

export const renderListings = (articles = []) => {
  if (!elements.grid) return;
  if (!articles.length) {
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  articles.forEach((article, index) => {
    fragment.append(buildCard(article, index, articles.length));
  });
  elements.grid.innerHTML = "";
  elements.grid.append(fragment);
};

export const updateStats = ({ total = 0 } = {}) => {
  if (elements.footerCount) elements.footerCount.textContent = total;
};

export const renderInquiries = (items = []) => {
  if (elements.inquiriesSummary) {
    elements.inquiriesSummary.textContent = items.length
      ? `${items.length} entr${items.length === 1 ? "y" : "ies"}`
      : "no inquiries yet";
  }

  if (!elements.inquiriesContent) return;
  elements.inquiriesContent.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "inquiries-panel__empty";
    empty.textContent = "no inquiries yet";
    elements.inquiriesContent.append(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "inquiries-list";

  items.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "inquiries-item";

    const header = document.createElement("div");
    header.className = "inquiries-item__header";

    const nameNode = document.createElement("span");
    nameNode.className = "inquiries-item__name";
    nameNode.textContent = entry.name;

    const timestampNode = document.createElement("span");
    timestampNode.className = "inquiries-item__timestamp";
    const formattedTimestamp = formatTimestamp(entry.createdAt);
    timestampNode.textContent = formattedTimestamp;

    header.append(nameNode, timestampNode);
    item.append(header);

    const emailNode = document.createElement("a");
    emailNode.className = "inquiries-item__email";
    emailNode.href = `mailto:${entry.email}`;
    emailNode.textContent = entry.email;
    item.append(emailNode);

    if (entry.phone) {
      const phoneLink = document.createElement("a");
      phoneLink.className = "inquiries-item__phone";
      const telValue = entry.phone.replace(/[^+\d]/g, "");
      phoneLink.href = telValue ? `tel:${telValue}` : `tel:${entry.phone}`;
      phoneLink.textContent = entry.phone;
      item.append(phoneLink);
    }

    if (entry.message) {
      const messageNode = document.createElement("p");
      messageNode.className = "inquiries-item__message";
      messageNode.textContent = entry.message;
      item.append(messageNode);
    }

    const listingSection = document.createElement("div");
    listingSection.className = "inquiries-item__body";

    const hasImage = typeof entry.listingImage === "string" && entry.listingImage.trim().length;
    if (hasImage) {
      const figure = document.createElement("figure");
      figure.className = "inquiries-item__preview";

      const img = document.createElement("img");
      img.src = entry.listingImage.trim();
      img.alt = entry.listingTitle ? `${entry.listingTitle} preview` : "listing preview";
      img.loading = "lazy";
      figure.append(img);

      listingSection.append(figure);
    }

    const detailWrap = document.createElement("div");
    detailWrap.className = "inquiries-item__details";

    const titleText = entry.listingTitle ? String(entry.listingTitle).trim() : "";
    if (titleText) {
      const titleNode = document.createElement("p");
      titleNode.className = "inquiries-item__listing-title";
      titleNode.textContent = titleText;
      detailWrap.append(titleNode);
    }

    const priceText = entry.listingPriceDisplay ? String(entry.listingPriceDisplay).trim() : "";
    if (priceText) {
      const priceNode = document.createElement("p");
      priceNode.className = "inquiries-item__listing-price";
      priceNode.textContent = priceText;
      detailWrap.append(priceNode);
    }

    const metaSegments = [];
    if (entry.listingSize) {
      metaSegments.push(`size ${String(entry.listingSize).trim()}`);
    }
    if (entry.listingStatus) {
      metaSegments.push(String(entry.listingStatus).trim());
    }
    if (metaSegments.length) {
      const metaNode = document.createElement("p");
      metaNode.className = "inquiries-item__listing-meta";
      metaNode.textContent = metaSegments.join(" • ");
      detailWrap.append(metaNode);
    }

    if (entry.listingId) {
      const idNode = document.createElement("p");
      idNode.className = "inquiries-item__listing-id";
      idNode.textContent = `id: ${entry.listingId}`;
      detailWrap.append(idNode);
    }

    if (!detailWrap.childElementCount) {
      const fallbackNode = document.createElement("p");
      fallbackNode.className = "inquiries-item__listing-note";
      fallbackNode.textContent = entry.listingId
        ? "listing details unavailable"
        : "no linked listing";
      detailWrap.append(fallbackNode);
    }

    listingSection.append(detailWrap);
    item.append(listingSection);

    if (entry.id && listeners.onDeleteInquiry) {
      const actions = document.createElement("div");
      actions.className = "inquiries-item__actions";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "inquiries-item__action inquiries-item__action--delete";
      deleteButton.textContent = "delete";
      deleteButton.addEventListener("click", () => {
        listeners.onDeleteInquiry?.(entry);
      });

      actions.append(deleteButton);
      item.append(actions);
    }

    list.append(item);
  });

  elements.inquiriesContent.append(list);
};

export const toggleAddPanel = (shouldOpen) => {
  if (!elements.addPanel) return;
  const open = shouldOpen === true;
  const wasOpen = elements.addPanel.classList.contains("is-open");
  elements.addPanel.classList.toggle("is-open", open);
  elements.addPanel.setAttribute("aria-hidden", String(!open));
  document.body.classList.toggle("is-modal-open", open);
  if (open) {
    const firstField = elements.form?.querySelector("input, textarea");
    firstField?.focus({ preventScroll: true });
  } else {
    elements.openPanel?.focus({ preventScroll: true });
  }
  if (open && !wasOpen) {
    listeners.onPanelOpen?.();
  }
  if (!open && wasOpen) {
    listeners.onPanelClose?.();
  }
};

export { toggleInquiriesPanel };
