import { PlatformExperienceForm } from "./component/platform-experience-form";

export default async function LectureFinalPage({ params }: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PlatformExperienceForm code={code} />;
}
