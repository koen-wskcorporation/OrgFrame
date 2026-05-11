/**
 * Convert sanitized rich-text HTML to plain text suitable for an inline
 * editor (textarea). Preserves paragraph and list breaks as newlines and
 * unescapes the basic named entities. Used by block renderers that swap
 * a rich-text display for an `<InlineText multiline>` in edit mode.
 */
export function richTextHtmlToPlainText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Inverse of `richTextHtmlToPlainText`. Wraps each blank-line-separated
 * paragraph in `<p>`, converts single newlines to `<br>`, and escapes the
 * basic special chars so the sanitizer doesn't have to. Output is safe to
 * pass to `sanitizeRichTextHtml`.
 */
export function plainTextToRichTextHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return trimmed
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escape(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

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
