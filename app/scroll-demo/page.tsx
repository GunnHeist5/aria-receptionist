import { HeroScrollDemo } from "@/components/hero-scroll-demo";

export const metadata = {
  title: "Scroll Animation Demo - ARIA Capital",
  description: "Interactive scroll animation showcase",
};

export default function ScrollDemoPage() {
  return (
    <main className="w-full">
      <HeroScrollDemo />
    </main>
  );
}
