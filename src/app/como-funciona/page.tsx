import HowItWorksRules from "@/components/HowItWorksRules";

export const metadata = { title: "Cómo funciona — DóndeHay" };

export default function ComoFuncionaPage() {
  return (
    <div className="space-y-4">
      <h1 className="px-1 font-display text-xl">Cómo funciona</h1>
      <HowItWorksRules />
    </div>
  );
}
