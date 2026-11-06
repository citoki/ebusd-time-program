/** Vite inlines `?inline` imports as a data: URL string. */
declare module "*.webp?inline" {
  const dataUrl: string;
  export default dataUrl;
}
