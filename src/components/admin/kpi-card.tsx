const BAR_COLOR: Record<string, string> = {
  blue: "bg-[#2a4090]",
  green: "bg-[#1a5040]",
  amber: "bg-[#5a4010]",
  red: "bg-[#5a2020]",
};

const VALUE_COLOR: Record<string, string> = {
  blue: "text-[#7c9ff5]",
  green: "text-[#4ecb8d]",
  amber: "text-[#f0b429]",
  red: "text-[#f07070]",
};

export function KpiCard({
  icon,
  label,
  value,
  sub,
  accent = "blue",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "blue" | "green" | "amber" | "red" | "none";
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[10px] border bg-[#13161f] p-3 ${
        accent === "blue" ? "border-[#2a3560]" : "border-[#1e2130]"
      }`}
    >
      {accent !== "none" && <div className={`absolute inset-x-0 top-0 h-0.5 ${BAR_COLOR[accent]}`} />}
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-[#4a5070]">
        {icon}
        {label}
      </p>
      <p className={`text-[22px] font-medium leading-none ${accent !== "none" ? VALUE_COLOR[accent] : "text-[#e8eaf2]"}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-[#3a4060]">{sub}</p>}
    </div>
  );
}
