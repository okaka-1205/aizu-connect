export type LegalDocument = "terms" | "privacy";

export const TERMS_VERSION = "2026-10-23";
export const PRIVACY_VERSION = "2026-10-23";

export const legalDocumentMetadata = {
  terms: {
    eyebrow: "TERMS OF USE",
    title: "利用規約",
    version: TERMS_VERSION,
  },
  privacy: {
    eyebrow: "PRIVACY POLICY",
    title: "プライバシーポリシー",
    version: PRIVACY_VERSION,
  },
};
