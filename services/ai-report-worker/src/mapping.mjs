function center(box) {
  return [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
}

function squaredDistance(point, box) {
  const [x, y] = center(box);
  return (point[0] - x) ** 2 + (point[1] - y) ** 2;
}

function area(box) {
  return Math.max(0, box.x2 - box.x1) * Math.max(0, box.y2 - box.y1);
}

function pointFromAnchor(anchor) {
  if (!anchor || typeof anchor !== "object") return null;
  const coords = anchor.coords;
  if (anchor.kind === "point" && Array.isArray(coords) && coords.length >= 2) return [Number(coords[0]), Number(coords[1])];
  if (anchor.kind === "point" && coords && typeof coords === "object") return [Number(coords.x), Number(coords.y)];
  if (anchor.kind === "box" && coords && typeof coords === "object") {
    const x = Number(coords.x ?? coords.x1 ?? 0) + Number(coords.width ?? (coords.x2 - coords.x1) ?? 0) / 2;
    const y = Number(coords.y ?? coords.y1 ?? 0) + Number(coords.height ?? (coords.y2 - coords.y1) ?? 0) / 2;
    return [x, y];
  }
  return null;
}

export function mapQuestionsToRegions(questionSnapshot, regions) {
  const questions = Array.isArray(questionSnapshot?.questions) ? questionSnapshot.questions : [];
  return questions.map((question) => {
    const point = pointFromAnchor(question.anchor);
    let matched = null;
    if (point?.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
      const containing = regions.filter(({ bboxNorm: box }) => point[0] >= box.x1 && point[0] <= box.x2 && point[1] >= box.y1 && point[1] <= box.y2);
      if (containing.length) matched = containing.toSorted((left, right) => area(left.bboxNorm) - area(right.bboxNorm))[0] ?? null;
      else {
        const nearest = regions.toSorted((left, right) => squaredDistance(point, left.bboxNorm) - squaredDistance(point, right.bboxNorm))[0] ?? null;
        matched = nearest && squaredDistance(point, nearest.bboxNorm) <= .15 ** 2 ? nearest : null;
      }
    }
    return {
      questionAlias: String(question.questionAlias),
      text: String(question.text ?? ""),
      category: String(question.category ?? ""),
      status: String(question.status ?? ""),
      reactionCount: Number(question.reactionCount ?? 0),
      answers: Array.isArray(question.answers) ? question.answers.map((answer) => ({ body: String(answer.body ?? "") })) : [],
      anchor: question.anchor ?? null,
      regionAlias: matched?.alias ?? null,
      mappingStatus: matched ? "mapped" : point ? "coordinate-unmapped" : "no-coordinate",
    };
  });
}

export function evidenceRefs(materialAlias, slideAlias, regions, pins) {
  return new Set([
    ...regions.map((region) => `${materialAlias}/${slideAlias}/${region.alias}`),
    ...pins.map((pin) => `${materialAlias}/${slideAlias}/${pin.questionAlias}`),
  ]);
}
