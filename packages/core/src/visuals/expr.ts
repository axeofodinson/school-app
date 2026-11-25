// Safe maths expressions for widgets (`function_graph` "m*x + c", DATABASE_DESIGN
// §4). A small recursive-descent parser: numbers, named variables, + - * / ^,
// brackets, implicit multiplication ("2x", "3(x+1)") and a fixed list of
// functions. Never `eval`/`Function`. The importer checks every `expr` with it;
// widgets (prompt 33) evaluate the tree with evalExpr.

export type Expr =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'neg'; a: Expr }
  | { k: 'bin'; op: '+' | '-' | '*' | '/' | '^'; a: Expr; b: Expr }
  | { k: 'call'; fn: ExprFn; args: Expr[] };

export const EXPR_FUNCTIONS = {
  sin: 1,
  cos: 1,
  tan: 1,
  sqrt: 1,
  abs: 1,
  ln: 1,
  log: 1,
  exp: 1,
  floor: 1,
  ceil: 1,
  round: 1,
  min: 2,
  max: 2,
} as const;
export type ExprFn = keyof typeof EXPR_FUNCTIONS;
export const EXPR_CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export type ExprError = 'empty' | 'tooLong' | 'unexpected' | 'unknownName' | 'arity';
export type ExprResult =
  | { ok: true; expr: Expr; vars: string[] }
  | { ok: false; error: ExprError; at: number; detail?: string };

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const MAX_LEN = 200;
const MAX_DEPTH = 40;

type Tok =
  | { t: 'num'; v: number; at: number }
  | { t: 'id'; v: string; at: number }
  | { t: 'op'; v: string; at: number }
  | { t: 'end'; at: number };

function lex(src: string): Tok[] | { at: number } {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) return { at: i };
      out.push({ t: 'num', v: Number(m[0]), at: i });
      i += m[0].length;
    } else if (/[a-zA-Z_]/.test(c)) {
      const m = /^[a-zA-Z_][a-zA-Z_0-9]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0], at: i });
      i += m[0].length;
    } else if ('+-*/^(),'.includes(c)) {
      out.push({ t: 'op', v: c, at: i });
      i++;
    } else {
      return { at: i };
    }
  }
  out.push({ t: 'end', at: src.length });
  return out;
}

class Fail {
  constructor(
    public error: ExprError,
    public at: number,
    public detail?: string,
  ) {}
}

/** Parse `src`; every name must be a known variable, constant or function. */
export function parseExpr(src: string, variables: readonly string[]): ExprResult {
  if (!src.trim()) return { ok: false, error: 'empty', at: 0 };
  if (src.length > MAX_LEN) return { ok: false, error: 'tooLong', at: MAX_LEN };
  const toks = lex(src);
  if (!Array.isArray(toks)) return { ok: false, error: 'unexpected', at: toks.at };
  const known = new Set(variables);
  const used = new Set<string>();
  let p = 0;
  let depth = 0;
  const peek = () => toks[p]!;
  const isOp = (v: string) => {
    const t = peek();
    return t.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new Fail('unexpected', peek().at);
    p++;
  };

  const sum = (): Expr => {
    let a = product();
    while (isOp('+') || isOp('-')) {
      const op = (peek() as { v: '+' | '-' }).v;
      p++;
      a = { k: 'bin', op, a, b: product() };
    }
    return a;
  };
  // Starts of an implicitly multiplied factor: 2x, 2(x+1), x y, (a)(b).
  const startsFactor = () => {
    const t = peek();
    return t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '(');
  };
  const product = (): Expr => {
    let a = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = (peek() as { v: '*' | '/' }).v;
        p++;
        a = { k: 'bin', op, a, b: unary() };
      } else if (startsFactor()) {
        a = { k: 'bin', op: '*', a, b: power() };
      } else return a;
    }
  };
  const unary = (): Expr => {
    if (isOp('-')) {
      p++;
      return { k: 'neg', a: unary() };
    }
    if (isOp('+')) {
      p++;
      return unary();
    }
    return power();
  };
  const power = (): Expr => {
    const base = atom();
    if (isOp('^')) {
      p++;
      return { k: 'bin', op: '^', a: base, b: unary() };
    }
    return base;
  };
  const atom = (): Expr => {
    if (++depth > MAX_DEPTH) throw new Fail('tooLong', peek().at);
    try {
      const t = peek();
      if (t.t === 'num') {
        p++;
        return { k: 'num', v: t.v };
      }
      if (t.t === 'op' && t.v === '(') {
        p++;
        const e = sum();
        expect(')');
        return e;
      }
      if (t.t === 'id') {
        p++;
        if (own(EXPR_FUNCTIONS, t.v)) {
          const fn = t.v as ExprFn;
          expect('(');
          const args = [sum()];
          while (isOp(',')) {
            p++;
            args.push(sum());
          }
          expect(')');
          if (args.length !== EXPR_FUNCTIONS[fn]) throw new Fail('arity', t.at, fn);
          return { k: 'call', fn, args };
        }
        if (known.has(t.v)) {
          used.add(t.v);
          return { k: 'var', name: t.v };
        }
        if (own(EXPR_CONSTANTS, t.v)) return { k: 'num', v: EXPR_CONSTANTS[t.v]! };
        throw new Fail('unknownName', t.at, t.v);
      }
      throw new Fail('unexpected', t.at);
    } finally {
      depth--;
    }
  };

  try {
    const expr = sum();
    if (peek().t !== 'end') throw new Fail('unexpected', peek().at);
    return { ok: true, expr, vars: [...used] };
  } catch (e) {
    if (e instanceof Fail)
      return e.detail === undefined
        ? { ok: false, error: e.error, at: e.at }
        : { ok: false, error: e.error, at: e.at, detail: e.detail };
    throw e;
  }
}

const FN_IMPL: Record<ExprFn, (...a: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
};

/** Evaluate a parsed expression. A missing variable reads as NaN. */
export function evalExpr(e: Expr, env: Record<string, number>): number {
  switch (e.k) {
    case 'num':
      return e.v;
    case 'var':
      return env[e.name] ?? NaN;
    case 'neg':
      return -evalExpr(e.a, env);
    case 'call':
      return FN_IMPL[e.fn](...e.args.map((a) => evalExpr(a, env)));
    case 'bin': {
      const a = evalExpr(e.a, env);
      const b = evalExpr(e.b, env);
      switch (e.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return a / b;
        case '^':
          return a ** b;
      }
    }
  }
}
