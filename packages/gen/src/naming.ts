/** 識別子の整形と VB 予約語の回避 */

export function pascalCase(s: string): string {
  return s
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function camelCase(s: string): string {
  const p = pascalCase(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/**
 * 任意の文字列から VB の識別子を作る。
 * - 英数字を含む: PascalCase（先頭が数字なら `_` を付ける）
 * - 空文字: `Empty`
 * - 記号・空白だけ: 文字ごとの名前をつなぐ（`-` → `Hyphen`、`*` → `Asterisk`、`<=` → `LessThanEqual`）。
 *   ASCII に無い文字はコードポイント（`★` → `U2605`）
 * `_` 単独は VB では行継続文字で識別子にならないので、どの入力でも返さない（enum の空文字で起きたコンパイルエラーの対策）
 */
export function toIdentifier(s: string): string {
  const p = pascalCase(s);
  if (p.length === 0) return symbolIdentifier(s);
  return /^[0-9]/.test(p) ? `_${p}` : p;
}

/** 英数字を含まない文字列（空文字・記号・空白）の識別子 */
function symbolIdentifier(s: string): string {
  if (s.length === 0) return "Empty";
  return [...s]
    .map((ch) => SYMBOL_NAMES[ch] ?? `U${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
    .join("");
}

// ASCII の記号・空白の名前（enum の値が記号だけのとき、`Public Const` の名前に使う）
const SYMBOL_NAMES: Readonly<Record<string, string>> = {
  " ": "Space",
  "!": "Exclamation",
  '"': "Quote",
  "#": "Hash",
  $: "Dollar",
  "%": "Percent",
  "&": "Ampersand",
  "'": "Apostrophe",
  "(": "LeftParen",
  ")": "RightParen",
  "*": "Asterisk",
  "+": "Plus",
  ",": "Comma",
  "-": "Hyphen",
  ".": "Dot",
  "/": "Slash",
  ":": "Colon",
  ";": "Semicolon",
  "<": "LessThan",
  "=": "Equal",
  ">": "GreaterThan",
  "?": "Question",
  "@": "At",
  "[": "LeftBracket",
  "\\": "Backslash",
  "]": "RightBracket",
  "^": "Caret",
  _: "Underscore",
  "`": "Backtick",
  "{": "LeftBrace",
  "|": "Pipe",
  "}": "RightBrace",
  "~": "Tilde",
};

// VB.NET の予約語（大文字小文字を区別しない）。プロパティ名等にぶつかったら [] で囲む
const VB_KEYWORDS = new Set(
  `AddHandler AddressOf Alias And AndAlso As Boolean ByRef Byte ByVal Call Case Catch CBool CByte CChar CDate
CDbl CDec Char CInt Class CLng CObj Const Continue CSByte CShort CSng CStr CType CUInt CULng CUShort Date Decimal
Declare Default Delegate Dim DirectCast Do Double Each Else ElseIf End EndIf Enum Erase Error Event Exit False
Finally For Friend Function Get GetType GetXMLNamespace Global GoSub GoTo Handles If Implements Imports In
Inherits Integer Interface Is IsNot Let Lib Like Long Loop Me Mod Module MustInherit MustOverride MyBase MyClass
NameOf Namespace Narrowing New Next Not Nothing NotInheritable NotOverridable Object Of On Operator Option
Optional Or OrElse Out Overloads Overridable Overrides ParamArray Partial Private Property Protected Public
RaiseEvent ReadOnly ReDim REM RemoveHandler Resume Return SByte Select Set Shadows Shared Short Single Static
Step Stop String Structure Sub SyncLock Then Throw To True Try TryCast TypeOf UInteger ULong UShort Using
Variant Wend When While Widening With WithEvents WriteOnly Xor`
    .split(/\s+/)
    .map((k) => k.toLowerCase()),
);

export function vbEscape(identifier: string): string {
  return VB_KEYWORDS.has(identifier.toLowerCase()) ? `[${identifier}]` : identifier;
}

// System.Object のメンバー名（大文字小文字を区別しない）。生成する DTO・実装クラス・BridgeEvents は Object を継承するので、
// メソッド名・プロパティ名・イベント名がこれと同じだと基底のメンバーとぶつかる。予約語と違って [] では避けられない
const OBJECT_MEMBERS = new Set(
  ["Equals", "Finalize", "GetHashCode", "GetType", "MemberwiseClone", "ReferenceEquals", "ToString"].map((m) => m.toLowerCase()),
);

/** System.Object のメンバー名と同じか（契約側で名前を変えてもらうための検出） */
export function isObjectMember(identifier: string): boolean {
  return OBJECT_MEMBERS.has(identifier.toLowerCase());
}

const TS_RESERVED = new Set(
  `break case catch class const continue debugger default delete do else enum export extends false finally for
function if import in instanceof new null return super switch this throw true try typeof var void while with
yield let static implements interface package private protected public await`.split(/\s+/),
);

export function isTsReserved(identifier: string): boolean {
  return TS_RESERVED.has(identifier);
}
