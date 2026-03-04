(function (global) {
  const FALLBACK_LANG = "en";
  const RTL_LANGS = new Set(["ar", "he", "ur"]);
  const SUPPORTED = [
    "en", "es", "fr", "de", "it", "pt", "nl", "ru", "uk", "pl", "tr", "ar", "he", "hi", "bn", "ur",
    "zh_CN", "zh_TW", "ja", "ko", "id", "vi", "th", "ms", "sv", "no", "da", "fi", "cs", "ro", "hu", "el"
  ];

  const cache = {};
  let activeLang = FALLBACK_LANG;

  function normalizeLanguage(lang) {
    if (!lang) return FALLBACK_LANG;
    const clean = String(lang).replace("-", "_");
    if (SUPPORTED.includes(clean)) return clean;
    const base = clean.split("_")[0];
    if (SUPPORTED.includes(base)) return base;
    if (base === "zh") return "zh_CN";
    return FALLBACK_LANG;
  }

  async function loadMessages(lang) {
    const normalized = normalizeLanguage(lang);
    if (cache[normalized]) return cache[normalized];

    try {
      const res = await fetch(chrome.runtime.getURL(`_locales/${normalized}/messages.json`));
      cache[normalized] = await res.json();
      return cache[normalized];
    } catch {
      if (normalized !== FALLBACK_LANG) return loadMessages(FALLBACK_LANG);
      cache[FALLBACK_LANG] = {};
      return cache[FALLBACK_LANG];
    }
  }

  function applyPlaceholders(message, substitutions = []) {
    if (!Array.isArray(substitutions)) substitutions = [substitutions];
    let out = message;
    substitutions.forEach((v, i) => {
      out = out.replaceAll(`$${i + 1}`, String(v));
    });
    return out;
  }

  async function resolveLanguageOverride() {
    try {
      const key = typeof STORAGE_KEY !== "undefined" ? STORAGE_KEY : "appData";
      const result = await chrome.storage.local.get(key);
      const appData = result[key] || {};
      const override = appData.settings?.languageOverride || "auto";
      if (override && override !== "auto") return normalizeLanguage(override);
    } catch {
      // noop
    }

    try {
      return normalizeLanguage(chrome.i18n.getUILanguage());
    } catch {
      return FALLBACK_LANG;
    }
  }

  async function init() {
    activeLang = await resolveLanguageOverride();
    await loadMessages(FALLBACK_LANG);
    await loadMessages(activeLang);
    if (typeof document !== "undefined") {
      document.body.classList.toggle("rtl", RTL_LANGS.has(activeLang.split("_")[0]));
    }
    return activeLang;
  }

  function getMessageFromDict(dict, key, substitutions) {
    const entry = dict?.[key];
    if (!entry || !entry.message) return null;
    return applyPlaceholders(entry.message, substitutions);
  }

  function t(key, substitutions = []) {
    const fromActive = getMessageFromDict(cache[activeLang], key, substitutions);
    if (fromActive) return fromActive;

    const fallback = getMessageFromDict(cache[FALLBACK_LANG], key, substitutions);
    if (fallback) return fallback;

    return key;
  }

  function getMessage(lang, key, substitutions = []) {
    const normalized = normalizeLanguage(lang);
    const fromSpecific = getMessageFromDict(cache[normalized], key, substitutions);
    if (fromSpecific) return fromSpecific;
    const fallback = getMessageFromDict(cache[FALLBACK_LANG], key, substitutions);
    return fallback || key;
  }

  function apply(root = document) {
    if (!root?.querySelectorAll) return;

    root.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      el.setAttribute("placeholder", t(key));
    });

    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      el.setAttribute("title", t(key));
    });
  }

  function getActiveLanguage() {
    return activeLang;
  }

  function setActiveLanguage(lang) {
    activeLang = normalizeLanguage(lang);
    if (typeof document !== "undefined") {
      document.body.classList.toggle("rtl", RTL_LANGS.has(activeLang.split("_")[0]));
    }
  }

  const api = {
    SUPPORTED,
    init,
    t,
    apply,
    getMessage,
    loadMessages,
    normalizeLanguage,
    getActiveLanguage,
    setActiveLanguage
  };

  global.I18n = api;
})(globalThis);
