/**
 * Technology-term matching shared by the scorer and the screening resolver.
 *
 * A plain word-boundary match is wrong for terms that are also English words:
 * "ready to go", "no less than 5 years". Those terms only count when the text
 * around them is unmistakably about the technology.
 */

/** Word-boundary match so "go" doesn't match "google" and "java" doesn't match "javascript". */
export function mentions(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${esc}([^a-z0-9+#]|$)`, 'i').test(haystack);
}

const AMBIGUOUS: Record<string, RegExp> = {
  go: /\bgolang\b|\bgo\s*(lang|developer|engineer|programming|language|services?|microservices?|backend|routines?|modules?)\b|\b(in|with|using|written in|experience in|knowledge of)\s+go\b(?!\s+(to|through|over|ahead|beyond|live|back|out|onsite|on-site|remote|for|with|the|a|an)\b)|\bgo\s*[,/]\s*(rust|python|java|node|c\+\+)|\b(rust|python|java|node(\.js)?|c\+\+|kotlin)\s*[,/]\s*go\b|\bgo\s+(or|and)\s+(rust|python|java|node|c\+\+)\b|\b(rust|python|java|node(\.js)?|c\+\+|kotlin)\s+(or|and)\s+go\b/i,
  less: /\bless(\.js|\s+css)\b|\b(sass|scss)\s*(,|\/|and|or)\s*less\b|\bless\s*(,|\/|and|or)\s*(sass|scss)\b/i,
};

/** True when `term` is mentioned as a technology, not as an ordinary word. */
export function mentionsTech(haystack: string, term: string): boolean {
  const strict = AMBIGUOUS[term.toLowerCase()];
  if (strict) return strict.test(haystack);
  return mentions(haystack, term);
}
