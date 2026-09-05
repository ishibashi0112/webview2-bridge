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

/** 先頭が数字なら `_` を付け、識別子として成立させる */
export function toIdentifier(s: string): string {
  const p = pascalCase(s);
  if (p.length === 0) return "_";
  return /^[0-9]/.test(p) ? `_${p}` : p;
}

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

const TS_RESERVED = new Set(
  `break case catch class const continue debugger default delete do else enum export extends false finally for
function if import in instanceof new null return super switch this throw true try typeof var void while with
yield let static implements interface package private protected public await`.split(/\s+/),
);

export function isTsReserved(identifier: string): boolean {
  return TS_RESERVED.has(identifier);
}
