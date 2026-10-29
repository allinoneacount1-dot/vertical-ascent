// Runtime URLs of files under public/ (ref/05 §Gate string: src never spells a root-absolute assets path).
// BASE_URL is './' in builds (ref/01 base), so dist/ keeps working from any sub-folder or an extracted zip.
export const assetUrl = (path: string): string => `${import.meta.env.BASE_URL}${path}`
