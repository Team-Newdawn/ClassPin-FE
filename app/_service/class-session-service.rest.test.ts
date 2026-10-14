import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

// Load the existing Next alias imports without adding a test runner dependency.
function loadServices() {
  const databaseCall = () => { throw new Error("Direct Supabase business CRUD is forbidden"); };
  // Lecture settings go straight to the RPC until the BE PATCH accepts partial bodies.
  const rpcCalls: { name: string; args: unknown }[] = [];
  const lectureRpc = async (name: string, args: unknown) => {
    if (name !== "ohpin_update_lecture_settings") databaseCall();
    rpcCalls.push({ name, args });
    return { data: null, error: null };
  };
  const client = (anonymous: boolean) => ({
    auth: { getSession: async () => ({ data: { session: { access_token: anonymous ? "participant" : "owner", user: { id: "owner", is_anonymous: anonymous } } }, error: null }) },
    from: databaseCall, rpc: anonymous ? databaseCall : lectureRpc,
    storage: { from: () => ({
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.invalid/${path}` } }),
    }) },
  });
  const owner = client(false), audience = client(true);
  const mock = {
    supabaseConfigured: true,
    getSupabaseClient: () => owner,
    getAudienceSupabaseClient: () => audience,
    getSessionUser: async () => ({ id: "owner", is_anonymous: false }),
    ensureAnonymousUser: async () => ({ id: "participant", is_anonymous: true }),
  };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const load = (file: string): Record<string, unknown> => {
    if (modules.has(file)) return modules.get(file)!.exports;
    const loaded = { exports: {} as Record<string, unknown> };
    modules.set(file, loaded);
    const code = ts.transpileModule(readFileSync(path.resolve(file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function("require", "exports", "module", code)((name: string) => {
      if (name === "@/app/_infrastructure/supabase/client") return mock;
      assert(name.startsWith("@/"), `Unexpected runtime import: ${name}`);
      return load(`${name.slice(2)}.ts`);
    }, loaded.exports, loaded);
    return loaded.exports;
  };
  return { ...load("app/_service/class-session-service.ts"), ...load("app/_service/platform-experience-service.ts"), rpcCalls };
}

test("business services use REST DTOs, preserve settings, and strip participant notes", async () => {
  const service = loadServices() as typeof import("./class-session-service") & typeof import("./platform-experience-service") & { rpcCalls: { name: string; args: unknown }[] };
  const lectureSettings = () => (service.rpcCalls.at(-1)?.args as { settings: unknown } | undefined)?.settings;
  const requests: { url: string; method: string; token: string | null; body: Record<string, unknown> }[] = [];
  const folder = { id: "folder", name: "Folder", created_at: "2026-09-28", color_index: 2, purpose: "other", purpose_label: "Research" };
  const slide = { id: "slide", page_index: 0, material_version_id: "version", image_path: "owner/slide.jpg", source_page_index: null, slide_instructor_notes: [{ body: "private note" }] };
  const lecture = { id: "lecture", course_id: "course", title: "Lecture", join_code: "PIN123", status: "live", current_page: 0, presentation_autoplay: true, presentation_interactions: true, show_question_pins: true, show_presentation_qr: true, presentation_qr_position: "bottom-right", allow_question_reactions: false, allow_emoji_reactions: true, created_at: "2026-09-28", materials: [{ id: "material", file_name: "deck.pptx", created_at: "2026-09-28", material_versions: [{ id: "version", version_no: 1, source_path: "owner/source.pptx", slides: [slide] }] }], questions: [] };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input), method = init?.method ?? "GET";
    requests.push({ url, method, token: new Headers(init?.headers).get("authorization"), body: init?.body ? JSON.parse(String(init.body)) : {} });
    let response: unknown;
    if (url.endsWith("/folders")) response = method === "POST" ? folder : [folder];
    else if (url.endsWith("/courses")) response = [{ id: "course", folder_id: "folder", lectures: [lecture] }];
    else if (url.endsWith("/slides") && method === "GET") response = [slide];
    else if (url.endsWith("/join/BEFORE1")) return new Response(null, { status: 204 });
    else if (url.endsWith("/join/ENDED1") || url.endsWith("/participant/lectures/ended/state")) return Response.json({ error: "Gone" }, { status: 410 });
    else if (url.endsWith("/join/NONE01")) return Response.json({ error: "Not found" }, { status: 404 });
    else if (url.endsWith("/join/PIN123") || url.endsWith("/participant/lectures/lecture") || url.endsWith("/state")) response = lecture;
    else if (url.endsWith("/questions") && method === "GET") response = [];
    else if (url.endsWith("/courses/course")) response = { deleted: true, cleanupPending: true };
    else if (url.endsWith("/slides/slide") && method === "DELETE") response = { deleted_image_path: "owner/slide.jpg", deleted_page_index: 0, deleted_question_count: 0 };
    else if (url.endsWith("/storage-cleanup")) response = { cleanupPending: false };
    return response === undefined ? new Response(null, { status: 204 }) : Response.json(response);
  };
  try {
    const folders = await service.fetchOwnedClassFolders();
    assert.equal(folders[0].purposeLabel, "Research");
    await service.createClassFolder({ name: " Folder ", colorIndex: 2, purpose: "other", purposeLabel: " Research " });
    assert.deepEqual(requests.at(-1)?.body, { name: "Folder", colorIndex: 2, purpose: "other", purposeLabel: "Research" });
    const [session] = await service.fetchOwnedSessions();
    assert.equal(session.presentationAutoplay, true);
    assert.equal(session.slides[0].speakerNote, "private note");
    const audience = await service.fetchLiveSession("PIN123");
    assert.deepEqual([session.allowQuestionReactions, session.allowEmojiReactions, audience?.allowQuestionReactions], [false, true, false]);
    assert(audience);
    assert(!("speakerNote" in audience.slides[0]));
    assert(!("speakerNote" in (await service.fetchSessionSlides(audience, true))[0]));
    await service.fetchLectureSnapshot(audience, true);
    // 청중 입장: 시작 전 204·종료 410은 참여 불가, 없는 강의 404는 null이다.
    for (const code of ["BEFORE1", "ENDED1"]) await assert.rejects(service.fetchLiveSession(code), service.LectureClosedError);
    assert.equal(await service.fetchLiveSession("NONE01"), null);
    assert.equal((await service.fetchLectureSnapshot({ ...audience, id: "ended" }, true))?.status, "ended");
    await service.updateClassFolder("folder", { name: " Updated ", colorIndex: 2, purpose: "qa", purposeLabel: "ignored" });
    assert.deepEqual(requests.at(-1)?.body, { name: "Updated", purpose: "qa", purposeLabel: null });
    await service.moveSessionToFolder("course", null);
    await service.saveSlideInstructorNote("slide", "Note");
    await service.updateLecture("lecture", { allow_emoji_reactions: false });
    assert.deepEqual(lectureSettings(), { allow_emoji_reactions: false });
    await service.updateLecture("lecture", { presentation_autoplay: false, current_page: 1 });
    assert.deepEqual(service.rpcCalls.at(-1), { name: "ohpin_update_lecture_settings", args: { target_lecture_id: "lecture", settings: { presentation_autoplay: false, current_page: 1 } } });
    const question = { id: "question", sessionId: "lecture", slideIndex: 0, x: 0.4, y: 0.6, anchorKind: "point" as const, category: "concept" as const, marker: "pin" as const, text: "Why?", status: "unanswered" as const, isMine: true, reactionCount: 0, reactedByMe: false, createdAt: "2026-09-28" };
    await service.submitQuestion(session, question);
    assert.deepEqual(requests.at(-1)?.body, { id: "question", slideId: "slide", x: 0.4, y: 0.6, category: "concept", marker: "pin", text: "Why?" });
    const count = requests.length;
    await assert.rejects(service.submitQuestion(session, { ...question, anchorKind: "box" }), /point anchor/);
    assert.equal(requests.length, count);
    await service.updateQuestion("question", { category: "concept", marker: "pin", text: "Updated?" });
    await service.setQuestionReaction("question", true);
    await service.postAnswer("question", "Answer");
    await service.markQuestionResolved("question");
    await service.persistSession({ ...session, presentationAutoplay: false }, "owner/source.pptx");
    const material = requests.at(-1)?.body;
    assert.equal(material?.status, "before");
    assert.deepEqual(lectureSettings(), { status: "live" });
    assert.equal(material?.sourcePath, "owner/source.pptx");
    assert.deepEqual(material?.slides, [{ id: "slide", pageIndex: 0, imagePath: "owner/slide.jpg", sourcePageIndex: null }]);
    await service.persistSession(session, "owner/source.pptx");
    assert.deepEqual(lectureSettings(), { status: "live", presentation_autoplay: true });
    await service.submitLectureExperienceResponse("PIN123", "Helpful", "More examples");
    assert.deepEqual(requests.at(-1)?.body, { code: "PIN123", experience: "Helpful", improvement: "More examples" });
    assert.equal((await service.deleteClassSession("course")).cleanupPending, true);
    assert.equal((await service.deleteSessionSlide("slide")).cleanupPending, false);
    await service.deleteClassFolder("folder");
    assert(requests.every(({ url, token }) => url.startsWith("/api/rest/") && token === (url.includes("/participant/") ? "Bearer participant" : "Bearer owner")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
