import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["127.0.0.1"],
  // 상위 디렉터리에 다른 lockfile 이 있으면 Next 가 트레이싱 루트를 위로 잡아
  // standalone 출력이 중첩된 경로로 떨어진다. 항상 이 폴더를 루트로 고정한다.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};

export default nextConfig;
