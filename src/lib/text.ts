export function normalizeRichText(input: string) {
  return input
    .replace(/<!--\[if\s+mso\]>[\s\S]*?<!\[endif\]-->/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/p,\s*strong,\s*em,\s*ul,\s*ol,\s*li,\s*img,\s*h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6,\s*span,\s*div,\s*hr,\s*b,\s*i,\s*u,\s*a\s*\{[^}]*\}/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}