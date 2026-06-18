"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import UnicornScene from "unicornstudio-react";

export const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
};

interface RainbowMatrixProps {
  projectId?: string;
  className?: string;
  production?: boolean;
}

export const RainbowMatrixShader = ({
  projectId = "jYxrWzSRtsXNqZADHnVH",
  className,
  production = true
}: RainbowMatrixProps) => {
  const { width, height } = useWindowSize();
  const [isClient, setIsClient] = React.useState(false);

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  // Only render UnicornScene after hydration with valid dimensions
  if (!isClient || width === 0 || height === 0) {
    return (
      <div className={cn("flex flex-col items-center w-full h-full bg-gradient-to-b from-purple-900 via-blue-900 to-black", className)}>
        <div className="w-full h-full bg-gradient-to-r from-purple-600 via-pink-500 to-blue-600 opacity-20 animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center w-full h-full", className)}>
      <UnicornScene
        production={production}
        projectId={projectId}
        width={width}
        height={height}
      />
    </div>
  );
};

export default RainbowMatrixShader;
