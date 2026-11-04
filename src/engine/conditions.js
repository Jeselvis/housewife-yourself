// Condition evaluation. Pure, no I/O.
//
// A condition is either:
//   ["flag_a", "flag_b"]                          shorthand: all of these flags are set
//   { flags: [...], notFlags: [...], stats: { brand: ">=40000" } }   everything listed must hold
// An undefined condition is always true.

const EXPR = /^(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)$/;

export function evalStatExpr(expr, value) {
  const m = EXPR.exec(String(expr).trim());
  if (!m) throw new Error(`Bad stat expression: "${expr}"`);
  const n = Number(m[2]);
  switch (m[1]) {
    case '>=': return value >= n;
    case '<=': return value <= n;
    case '>': return value > n;
    case '<': return value < n;
    case '==': return value === n;
    case '!=': return value !== n;
    default: throw new Error(`Bad operator in "${expr}"`);
  }
}

export function normalizeCondition(cond) {
  if (cond == null) return {};
  if (Array.isArray(cond)) return { flags: cond };
  return cond;
}

export function evalCondition(cond, state) {
  const c = normalizeCondition(cond);
  const flags = new Set(state.flags);
  if ((c.flags ?? []).some((f) => !flags.has(f))) return false;
  if ((c.notFlags ?? []).some((f) => flags.has(f))) return false;
  for (const [key, expr] of Object.entries(c.stats ?? {})) {
    if (!evalStatExpr(expr, state.stats[key] ?? 0)) return false;
  }
  return true;
}
