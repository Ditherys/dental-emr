const c = {
  1569: [65152],
  1570: [65153, 65154],
  1571: [65155, 65156],
  1572: [65157, 65158],
  1573: [65159, 65160],
  1574: [65161, 65162, 65163, 65164],
  1575: [65165, 65166],
  1576: [65167, 65168, 65169, 65170],
  1577: [65171, 65172],
  1578: [65173, 65174, 65175, 65176],
  1579: [65177, 65178, 65179, 65180],
  1580: [65181, 65182, 65183, 65184],
  1581: [65185, 65186, 65187, 65188],
  1582: [65189, 65190, 65191, 65192],
  1583: [65193, 65194],
  1584: [65195, 65196],
  1585: [65197, 65198],
  1586: [65199, 65200],
  1587: [65201, 65202, 65203, 65204],
  1588: [65205, 65206, 65207, 65208],
  1589: [65209, 65210, 65211, 65212],
  1590: [65213, 65214, 65215, 65216],
  1591: [65217, 65218, 65219, 65220],
  1592: [65221, 65222, 65223, 65224],
  1593: [65225, 65226, 65227, 65228],
  1594: [65229, 65230, 65231, 65232],
  1601: [65233, 65234, 65235, 65236],
  1602: [65237, 65238, 65239, 65240],
  1603: [65241, 65242, 65243, 65244],
  1604: [65245, 65246, 65247, 65248],
  1605: [65249, 65250, 65251, 65252],
  1606: [65253, 65254, 65255, 65256],
  1607: [65257, 65258, 65259, 65260],
  1608: [65261, 65262],
  1609: [65263, 65264],
  1610: [65265, 65266, 65267, 65268]
}, F = (t) => t in c, g = (t) => t >= 1536 && t <= 1791 || t >= 64336 && t <= 65023 || t >= 65136 && t <= 65279;
function d(t) {
  for (const r of t) if (g(r.codePointAt(0))) return !0;
  return !1;
}
function P(t) {
  const r = t.map((n) => n.codePointAt(0)), o = (n) => (c[n]?.length ?? 0) === 4, e = (n) => (c[n]?.length ?? 0) >= 2;
  return t.map((n, s) => {
    const a = r[s], f = c[a];
    if (!f) return n;
    const l = s > 0 ? r[s - 1] : 0, u = s < r.length - 1 ? r[s + 1] : 0, h = F(l) && o(l) && e(a), m = o(a) && F(u) && e(u);
    let i = 0;
    h && m ? i = 3 : h ? i = 1 : m && (i = 2);
    const A = f[i] ?? f[0];
    return String.fromCodePoint(A);
  });
}
function p(t) {
  const r = [];
  for (const o of t) {
    const e = g(o.codePointAt(0)), n = r[r.length - 1];
    !n || n.rtl !== e ? r.push({ rtl: e, chars: [o] }) : n.chars.push(o);
  }
  return r.reverse().map((o) => o.rtl ? o.chars.reverse().join("") : o.chars.join("")).join("");
}
function j(t) {
  if (!t || !d(t)) return t;
  const r = Array.from(t);
  return p(P(r));
}
async function b(t) {
  if (t === "ar") {
    const { registerArabicFont: e, PDF_FONT_ARABIC: n } = await import("./notoArabic-En58EmGw.js");
    return { family: n, register: e, transform: j };
  }
  if (t === "zh") {
    const { registerCjkFont: e, PDF_FONT_CJK: n } = await import("./notoSC-G1i3iX-D.js");
    return { family: n, register: e, transform: (s) => s };
  }
  const { registerRobotoFont: r, PDF_FONT_FAMILY: o } = await import("./roboto-Bywi16HJ.js");
  return { family: o, register: r, transform: (e) => e };
}
export {
  b as loadPdfFont
};
//# sourceMappingURL=loader-BN_gLe6T.js.map
