/** `partNo` / `part_no` / `part-no` → `PartNo` */
export function toPascalCase(name: string): string {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((s) => s.length > 0);
  const joined = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  return /^[0-9]/.test(joined) ? `_${joined}` : joined;
}

/** VB の予約語（プロパティ名に使うと衝突するもの）。角括弧でエスケープする。 */
const VB_KEYWORDS = new Set(
  [
    "AddHandler", "AddressOf", "Alias", "And", "AndAlso", "As", "Boolean", "ByRef", "Byte", "ByVal", "Call", "Case",
    "Catch", "CBool", "CByte", "CChar", "CDate", "CDbl", "CDec", "Char", "CInt", "Class", "CLng", "CObj", "Const",
    "Continue", "CSByte", "CShort", "CSng", "CStr", "CType", "CUInt", "CULng", "CUShort", "Date", "Decimal", "Declare",
    "Default", "Delegate", "Dim", "DirectCast", "Do", "Double", "Each", "Else", "ElseIf", "End", "EndIf", "Enum",
    "Erase", "Error", "Event", "Exit", "False", "Finally", "For", "Friend", "Function", "Get", "GetType",
    "GetXMLNamespace", "Global", "GoSub", "GoTo", "Handles", "If", "Implements", "Imports", "In", "Inherits", "Integer",
    "Interface", "Is", "IsNot", "Let", "Lib", "Like", "Long", "Loop", "Me", "Mod", "Module", "MustInherit",
    "MustOverride", "MyBase", "MyClass", "Namespace", "Narrowing", "New", "Next", "Not", "Nothing", "NotInheritable",
    "NotOverridable", "Object", "Of", "On", "Operator", "Option", "Optional", "Or", "OrElse", "Out", "Overloads",
    "Overridable", "Overrides", "ParamArray", "Partial", "Private", "Property", "Protected", "Public", "RaiseEvent",
    "ReadOnly", "ReDim", "REM", "RemoveHandler", "Resume", "Return", "SByte", "Select", "Set", "Shadows", "Shared",
    "Short", "Single", "Static", "Step", "Stop", "String", "Structure", "Sub", "SyncLock", "Then", "Throw", "To",
    "True", "Try", "TryCast", "TypeOf", "UInteger", "ULong", "UShort", "Using", "Variant", "Wend", "When", "While",
    "Widening", "With", "WithEvents", "WriteOnly", "Xor",
  ].map((k) => k.toLowerCase()),
);

export function escapeVbIdentifier(name: string): string {
  return VB_KEYWORDS.has(name.toLowerCase()) ? `[${name}]` : name;
}

/** TS の識別子として安全か（安全でなければ引用符付きキーにする） */
export function tsPropertyKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}
