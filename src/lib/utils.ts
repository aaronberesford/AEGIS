export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatRiskTone(risk: string) {
  switch (risk) {
    case "high":
      return "bg-[rgba(239,68,68,0.16)] text-[#ff6d6d]";
    case "medium":
      return "bg-[rgba(245,158,11,0.16)] text-[#ffc14d]";
    default:
      return "bg-[rgba(34,197,94,0.16)] text-[#4ade80]";
  }
}
