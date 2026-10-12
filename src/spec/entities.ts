/**
 * Compact HTML5 named entity table plus numeric/named reference decoding.
 * DOM-free so the spec harness runs in the plain node test environment.
 * Only the common entities are listed; unknown names stay literal.
 */

const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn " +
  "sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute " +
  "Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde " +
  "Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave " +
  "aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth " +
  "ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";

const GREEK_UPPER =
  "Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu Nu Xi Omicron Pi Rho";
const GREEK_UPPER_REST = "Sigma Tau Upsilon Phi Chi Psi Omega";
const GREEK_LOWER =
  "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigmaf " +
  "sigma tau upsilon phi chi psi omega";

/** `name:codepoint` pairs for everything outside the sequential runs above. */
const OTHERS =
  "amp:38 lt:60 gt:62 quot:34 apos:39 OElig:338 oelig:339 Scaron:352 scaron:353 Yuml:376 Dcaron:270 " +
  "fnof:402 circ:710 tilde:732 thetasym:977 upsih:978 piv:982 ensp:8194 emsp:8195 thinsp:8201 " +
  "zwnj:8204 zwj:8205 lrm:8206 rlm:8207 ndash:8211 mdash:8212 lsquo:8216 rsquo:8217 sbquo:8218 " +
  "ldquo:8220 rdquo:8221 bdquo:8222 dagger:8224 Dagger:8225 bull:8226 hellip:8230 permil:8240 " +
  "prime:8242 Prime:8243 lsaquo:8249 rsaquo:8250 oline:8254 frasl:8260 euro:8364 image:8465 " +
  "weierp:8472 real:8476 trade:8482 alefsym:8501 larr:8592 uarr:8593 rarr:8594 darr:8595 " +
  "harr:8596 crarr:8629 lArr:8656 uArr:8657 rArr:8658 dArr:8659 hArr:8660 forall:8704 part:8706 " +
  "exist:8707 empty:8709 nabla:8711 isin:8712 notin:8713 ni:8715 prod:8719 sum:8721 minus:8722 " +
  "lowast:8727 radic:8730 prop:8733 infin:8734 ang:8736 and:8743 or:8744 cap:8745 cup:8746 " +
  "int:8747 there4:8756 sim:8764 cong:8773 asymp:8776 ne:8800 equiv:8801 le:8804 ge:8805 " +
  "sub:8834 sup:8835 nsub:8836 sube:8838 supe:8839 oplus:8853 otimes:8855 perp:8869 sdot:8901 " +
  "lceil:8968 rceil:8969 lfloor:8970 rfloor:8971 lang:10216 rang:10217 loz:9674 spades:9824 " +
  "clubs:9827 hearts:9829 diams:9830 check:10003 star:9734 starf:9733 hearts:9829 " +
  "HilbertSpace:8459 DifferentialD:8518 ClockwiseContourIntegral:8754 hbar:8463 " +
  "ell:8467 numero:8470 copysr:8471 angst:197 Hat:94 lbrace:123 rbrace:125 lbrack:91 rbrack:93 " +
  "lpar:40 rpar:41 comma:44 period:46 colon:58 semi:59 excl:33 quest:63 num:35 dollar:36 " +
  "percnt:37 ast:42 plus:43 equals:61 sol:47 bsol:92 lowbar:95 grave:96 verbar:124 vert:124 " +
  "Tab:9 NewLine:10 half:189 mldr:8230 nldr:8229 rarrw:8605 ShortRightArrow:8594 " +
  "ngE:8807,824 NotEqualTilde:8770,824 bne:61,8421 nvlt:60,8402 fjlig:102,106";

function buildTable(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  LATIN1.split(" ").forEach((name, i) => {
    map.set(name, String.fromCodePoint(160 + i));
  });
  GREEK_UPPER.split(" ").forEach((name, i) => {
    map.set(name, String.fromCodePoint(913 + i));
  });
  GREEK_UPPER_REST.split(" ").forEach((name, i) => {
    map.set(name, String.fromCodePoint(931 + i));
  });
  GREEK_LOWER.split(" ").forEach((name, i) => {
    map.set(name, String.fromCodePoint(945 + i));
  });
  for (const pair of OTHERS.split(" ")) {
    const [name, codes] = pair.split(":");
    if (name !== undefined && codes !== undefined) {
      map.set(name, String.fromCodePoint(...codes.split(",").map(Number)));
    }
  }
  return map;
}

export const ENTITIES: ReadonlyMap<string, string> = buildTable();

const REFERENCE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/g;

function codePointToString(cp: number): string {
  if (cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "�";
  return String.fromCodePoint(cp);
}

/** Decode one reference (`&amp;`, `&#35;`, `&#xD06;`); unknown names stay literal. */
export function decodeReference(
  whole: string,
  hex: string | undefined,
  dec: string | undefined,
  name: string | undefined,
): string {
  if (hex !== undefined) return codePointToString(parseInt(hex, 16));
  if (dec !== undefined) return codePointToString(parseInt(dec, 10));
  if (name !== undefined) return ENTITIES.get(name) ?? whole;
  return whole;
}

/** Replace every entity or numeric character reference in `text` with its character. */
export function decodeEntities(text: string): string {
  return text.replace(REFERENCE, (whole, hex?: string, dec?: string, name?: string) =>
    decodeReference(whole, hex, dec, name),
  );
}
