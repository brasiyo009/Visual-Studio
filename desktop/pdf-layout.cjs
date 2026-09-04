const LOGO_SIZE_VERSION = 2;
const LEGACY_LOGO_WIDTH = 74;
const DEFAULT_LOGO_WIDTH = LEGACY_LOGO_WIDTH * 2;
const MAX_LOGO_WIDTH = 280;

function normalizeLogoSettings(stored = {}) {
  const normalized = { ...stored, logoSizeVersion: LOGO_SIZE_VERSION };
  if ((Number(stored.logoSizeVersion) || 0) < LOGO_SIZE_VERSION) {
    const legacyWidth = Math.max(Number(stored.logoWidth) || LEGACY_LOGO_WIDTH, 20);
    normalized.logoWidth = Math.min(legacyWidth * 2, MAX_LOGO_WIDTH);
  }
  return normalized;
}

function logoBounds(settings, compact) {
  return {
    maxWidth: Math.min(Math.max(Number(settings.logoWidth) || DEFAULT_LOGO_WIDTH, 20), compact ? 192 : MAX_LOGO_WIDTH),
    maxHeight: compact ? 60 : 84,
  };
}

module.exports = { DEFAULT_LOGO_WIDTH, LOGO_SIZE_VERSION, logoBounds, normalizeLogoSettings };
