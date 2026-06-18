import { RainbowMatrixDemo } from "@/components/rainbow-matrix-demo";

export const metadata = {
  title: "Rainbow Matrix - ARIA Capital",
  description: "Interactive 3D rainbow matrix shader animation",
};

export default function RainbowDemoPage() {
  return (
    <main className="w-full">
      <RainbowMatrixDemo />
    </main>
  );
}
