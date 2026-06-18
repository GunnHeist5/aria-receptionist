"use client";

import { RainbowMatrixShader } from "@/components/ui/rainbow-matrix-shader";

export function RainbowMatrixDemo() {
  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-black">
      <RainbowMatrixShader
        projectId="jYxrWzSRtsXNqZADHnVH"
        production={true}
        className="w-full h-screen"
      />
    </div>
  );
}

export default RainbowMatrixDemo;
