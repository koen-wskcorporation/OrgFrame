export function sanitizeRichTextHtml(value: unknown, fallback = ""): string {
  const raw = typeof value === "string" ? value : fallback;
  if (!raw.trim()) {
    return "";
  }

  let safe = raw
    .replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "")
    .replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "")
    .replace(/on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/on[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");

  // Allow a compact subset of tags for rich descriptions.
  const allowed = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "a"]);
  safe = safe.replace(/<\/?([a-z0-9-]+)([^>]*)>/gi, (full, tagName: string, attrs: string) => {
    const tag = tagName.toLowerCase();
    if (!allowed.has(tag)) {
      return "";
    }

    if (tag !== "a") {
      return full.startsWith("</") ? `</${tag}>` : `<${tag}>`;
    }

    if (full.startsWith("</")) {
      return "</a>";
    }

    const hrefMatch = attrs.match(/href\s*=\s*"([^"]*)"/i) ?? attrs.match(/href\s*=\s*'([^']*)'/i);
    const href = hrefMatch?.[1]?.trim() ?? "";
    if (!href) {
      return "<a>";
    }

    const safeHref = /^https?:\/\//i.test(href) || href.startsWith("/") || href.startsWith("#") ? href : "#";
    const external = /^https?:\/\//i.test(safeHref);
    return `<a href=\"${safeHref}\"${external ? ' target=\"_blank\" rel=\"noopener noreferrer\"' : ""}>`;
  });

  return safe;
}
