type MaterialSearchSource = {
  title: string;
  fileName: string;
};

type MaterialSearchNode<T> = {
  children: Map<string, MaterialSearchNode<T>>;
  matches: Set<T>;
};

type MaterialSearchIndex<T extends MaterialSearchSource> = {
  materials: T[];
  root: MaterialSearchNode<T>;
};

const createNode = <T>(): MaterialSearchNode<T> => ({ children: new Map(), matches: new Set() });

const keywords = (value: string) => value
  .normalize("NFKC")
  .toLocaleLowerCase()
  .match(/[\p{L}\p{N}]+/gu) ?? [];

export function buildMaterialSearchIndex<T extends MaterialSearchSource>(materials: readonly T[]): MaterialSearchIndex<T> {
  const root = createNode<T>();

  for (const material of materials) {
    for (const keyword of new Set(keywords(`${material.title} ${material.fileName}`))) {
      let node = root;
      for (const character of keyword) {
        let child = node.children.get(character);
        if (!child) {
          child = createNode<T>();
          node.children.set(character, child);
        }
        child.matches.add(material);
        node = child;
      }
    }
  }

  return { materials: [...materials], root };
}

export function searchMaterialIndex<T extends MaterialSearchSource>(index: MaterialSearchIndex<T>, query: string): T[] {
  const terms = [...new Set(keywords(query))];
  if (!terms.length) return index.materials;

  const matches: Set<T>[] = [];
  for (const term of terms) {
    let node: MaterialSearchNode<T> | undefined = index.root;
    for (const character of term) {
      node = node.children.get(character);
      if (!node) return [];
    }
    matches.push(node.matches);
  }

  const smallest = matches.reduce((current, candidate) => candidate.size < current.size ? candidate : current);
  const materials: T[] = [];
  for (const material of smallest) {
    if (matches.every((match) => match.has(material))) materials.push(material);
  }
  return materials;
}
