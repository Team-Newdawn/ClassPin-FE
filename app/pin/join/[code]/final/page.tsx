import { PlatformExperienceForm } from "@/components/platform-experience-form";

export default async function FeedbackFinalPage({ params }: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PlatformExperienceForm source="feedback" code={code} />;
}
