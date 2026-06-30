// engine/font/type1-charstring.js
// A Type 1 charstring interpreter. Given a decrypted charstring (and the font's
// Subrs), it walks the glyph program and emits an outline to a sink with
// moveTo / lineTo / curveTo / close (all in 1000-unit glyph space). Returns the
// glyph's advance width (from hsbw / sbw).
//
// Covers the path-construction operators, callsubr/return, the flex and
// hint-replacement OtherSubrs, seac (via an optional resolver), and div.

function moveTo(sink, s, nx, ny) {
  if (s.open && !s.justClosed) sink.close();
  s.x = nx; s.y = ny; sink.moveTo(nx, ny); s.open = true; s.justClosed = false;
}
function lineTo(sink, s, nx, ny) { s.x = nx; s.y = ny; sink.lineTo(nx, ny); s.justClosed = false; }
function curveTo(sink, s, x1, y1, x2, y2, x3, y3) { sink.curveTo(x1, y1, x2, y2, x3, y3); s.x = x3; s.y = y3; s.justClosed = false; }
function closeContour(sink, s) { if (s.open && !s.justClosed) { sink.close(); s.justClosed = true; } }

function handleOtherSubr(s, sink, which, args) {
  switch (which) {
    case 1: s.flexing = true; s.flexPts = []; break;           // begin flex
    case 2: break;                                              // flex point (collected via rmoveto)
    case 0: {                                                   // end flex -> two curves
      s.flexing = false;
      const p = s.flexPts;
      if (p.length >= 7) {
        curveTo(sink, s, p[1][0], p[1][1], p[2][0], p[2][1], p[3][0], p[3][1]);
        curveTo(sink, s, p[4][0], p[4][1], p[5][0], p[5][1], p[6][0], p[6][1]);
      }
      s.ps.push(args[2]); s.ps.push(args[1]);                  // endy, endx -> pop pop setcurrentpoint
      break;
    }
    case 3: s.ps.push(args[0] != null ? args[0] : 3); break;    // hint replacement: subr#
    default: for (let k = args.length - 1; k >= 0; k--) s.ps.push(args[k]);
  }
}

function exec(cs, subrs, sink, s, opts, depth) {
  if (depth > 30) return;
  const st = s.st;
  let i = 0;
  while (i < cs.length && !s.done) {
    let v = cs[i++];
    if (v >= 32) {
      let num;
      if (v <= 246) num = v - 139;
      else if (v <= 250) num = (v - 247) * 256 + cs[i++] + 108;
      else if (v <= 254) num = -(v - 251) * 256 - cs[i++] - 108;
      else { num = ((cs[i] << 24) | (cs[i + 1] << 16) | (cs[i + 2] << 8) | cs[i + 3]); i += 4; }
      st.push(num);
      continue;
    }
    switch (v) {
      case 13: s.sbx = st[0]; s.width = st[1]; s.x = s.sbx; s.y = 0; st.length = 0; break;       // hsbw
      case 9: closeContour(sink, s); st.length = 0; break;                                       // closepath
      case 21: { const dy = st.pop(), dx = st.pop(); s.x += dx; s.y += dy; if (s.flexing) s.flexPts.push([s.x, s.y]); else moveTo(sink, s, s.x, s.y); st.length = 0; break; } // rmoveto
      case 22: { const dx = st.pop(); s.x += dx; if (s.flexing) s.flexPts.push([s.x, s.y]); else moveTo(sink, s, s.x, s.y); st.length = 0; break; } // hmoveto
      case 4: { const dy = st.pop(); s.y += dy; if (s.flexing) s.flexPts.push([s.x, s.y]); else moveTo(sink, s, s.x, s.y); st.length = 0; break; }  // vmoveto
      case 5: { const dy = st.pop(), dx = st.pop(); lineTo(sink, s, s.x + dx, s.y + dy); st.length = 0; break; }   // rlineto
      case 6: { const dx = st.pop(); lineTo(sink, s, s.x + dx, s.y); st.length = 0; break; }                       // hlineto
      case 7: { const dy = st.pop(); lineTo(sink, s, s.x, s.y + dy); st.length = 0; break; }                       // vlineto
      case 8: {                                                                                                    // rrcurveto
        const dy3 = st.pop(), dx3 = st.pop(), dy2 = st.pop(), dx2 = st.pop(), dy1 = st.pop(), dx1 = st.pop();
        const c1x = s.x + dx1, c1y = s.y + dy1, c2x = c1x + dx2, c2y = c1y + dy2;
        curveTo(sink, s, c1x, c1y, c2x, c2y, c2x + dx3, c2y + dy3); st.length = 0; break;
      }
      case 30: {                                                                                                   // vhcurveto
        const dx3 = st.pop(), dy2 = st.pop(), dx2 = st.pop(), dy1 = st.pop();
        const c1x = s.x, c1y = s.y + dy1, c2x = c1x + dx2, c2y = c1y + dy2;
        curveTo(sink, s, c1x, c1y, c2x, c2y, c2x + dx3, c2y); st.length = 0; break;
      }
      case 31: {                                                                                                   // hvcurveto
        const dy3 = st.pop(), dy2 = st.pop(), dx2 = st.pop(), dx1 = st.pop();
        const c1x = s.x + dx1, c1y = s.y, c2x = c1x + dx2, c2y = c1y + dy2;
        curveTo(sink, s, c1x, c1y, c2x, c2y, c2x, c2y + dy3); st.length = 0; break;
      }
      case 10: { const idx = st.pop(); const sub = subrs[idx]; if (sub) exec(sub, subrs, sink, s, opts, depth + 1); break; } // callsubr
      case 11: return;                                                                                            // return
      case 14: s.done = true; break;                                                                              // endchar
      case 1: case 3: st.length = 0; break;                                                                       // hstem / vstem
      case 12: {
        const v2 = cs[i++];
        switch (v2) {
          case 0: case 1: case 2: st.length = 0; break;                                                           // dotsection / vstem3 / hstem3
          case 6: {                                                                                               // seac
            const achar = st.pop(), bchar = st.pop(), ady = st.pop(), adx = st.pop(), asb = st.pop();
            st.length = 0;
            if (opts.seac) opts.seac(s, sink, asb, adx, ady, bchar, achar);
            s.done = true; break;
          }
          case 7: s.sbx = st[0]; s.sby = st[1]; s.width = st[2]; s.x = s.sbx; s.y = s.sby; st.length = 0; break;   // sbw
          case 12: { const b = st.pop(), a = st.pop(); st.push(a / b); break; }                                   // div
          case 16: {                                                                                              // callothersubr
            const which = st.pop(), n = st.pop(), args = [];
            for (let k = 0; k < n; k++) args.unshift(st.pop());
            handleOtherSubr(s, sink, which, args); break;
          }
          case 17: st.push(s.ps.length ? s.ps.pop() : 0); break;                                                  // pop
          case 33: s.x = st[0]; s.y = st[1]; st.length = 0; break;                                                // setcurrentpoint
          default: st.length = 0;
        }
        break;
      }
      default: st.length = 0;
    }
  }
}

export function runCharstring(cs, opts = {}) {
  const s = { x: 0, y: 0, width: 0, sbx: 0, sby: 0, st: [], ps: [], open: false, justClosed: false, flexing: false, flexPts: [], done: false };
  exec(cs, opts.subrs || [], opts.sink, s, opts, 0);
  if (s.open && !s.justClosed) opts.sink.close();
  return { width: s.width, sbx: s.sbx };
}
