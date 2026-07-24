import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // 상위 디렉터리에 다른 lockfile 이 있으면 Next 가 트레이싱 루트를 위로 잡아
  // standalone 출력이 중첩된 경로로 떨어진다. 항상 이 폴더를 루트로 고정한다.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  // sharp 는 네이티브 바이너리라 번들하지 않고 node_modules 에서 그대로 로드한다.
  serverExternalPackages: ["sharp"],
  experimental: { serverActions: { bodySizeLimit: "40mb" } },
};

export default nextConfig;
