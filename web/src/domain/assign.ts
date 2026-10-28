// Auto-assign students to sections. Pure function, unit tested.

export type AssignMethod = 'balanced' | 'fill' | 'alphabetical' | 'age' | 'gender';

export const ASSIGN_METHODS: Record<AssignMethod, string> = {
  balanced: 'Balanced: equal class sizes',
  fill: 'Fill in order: fill the first section, then the next',
  alphabetical: 'Alphabetical split: A-L in one, M-Z in the next',
  age: 'By age: older children together',
  gender: 'Gender-balanced: mix boys and girls evenly',
};

export interface AssignStudent {
  id: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  sex: 'M' | 'F';
  siblingKey?: string; // e.g. guardian mobile; same key = siblings
  pinnedSectionId?: string;
}

export interface AssignSection {
  id: string;
  capacity: number;
  current: number; // students already in the section
}

export interface AssignResult {
  assignments: Record<string, string>; // studentId -> sectionId
  unplaced: string[]; // no room left
}

export function autoAssign(
  students: AssignStudent[], sections: AssignSection[], method: AssignMethod, keepSiblings: boolean,
): AssignResult {
  const load = new Map(sections.map((s) => [s.id, s.current]));
  const cap = new Map(sections.map((s) => [s.id, s.capacity]));
  const room = (id: string) => (cap.get(id) ?? 0) - (load.get(id) ?? 0);
  const assignments: Record<string, string> = {};
  const unplaced: string[] = [];

  // Pinned students first.
  const free: AssignStudent[] = [];
  for (const s of students) {
    if (s.pinnedSectionId && load.has(s.pinnedSectionId)) {
      assignments[s.id] = s.pinnedSectionId;
      load.set(s.pinnedSectionId, (load.get(s.pinnedSectionId) ?? 0) + 1);
    } else free.push(s);
  }

  // Order students by the chosen method.
  const byName = (a: AssignStudent, b: AssignStudent) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
  let ordered = [...free].sort(byName);
  if (method === 'age') ordered.sort((a, b) => a.birthdate.localeCompare(b.birthdate));
  if (method === 'gender') {
    const boys = ordered.filter((s) => s.sex === 'M');
    const girls = ordered.filter((s) => s.sex === 'F');
    ordered = [];
    while (boys.length || girls.length) {
      if (boys.length) ordered.push(boys.shift()!);
      if (girls.length) ordered.push(girls.shift()!);
    }
  }

  // Group siblings so they move together.
  const groups: AssignStudent[][] = [];
  const seen = new Map<string, AssignStudent[]>();
  for (const s of ordered) {
    if (keepSiblings && s.siblingKey) {
      const g = seen.get(s.siblingKey);
      if (g) { g.push(s); continue; }
      const ng = [s];
      seen.set(s.siblingKey, ng);
      groups.push(ng);
    } else groups.push([s]);
  }

  // Quotas for contiguous methods: split the total as evenly as capacity allows.
  const total = [...load.values()].reduce((a, b) => a + b, 0) + groups.reduce((a, g) => a + g.length, 0);
  const totalCap = sections.reduce((a, s) => a + s.capacity, 0) || 1;
  const quota = new Map(sections.map((s) => [s.id, Math.ceil((total * s.capacity) / totalCap)]));
  const contiguous = method === 'alphabetical' || method === 'age';

  for (const g of groups) {
    let target: string | undefined;
    if (method === 'fill') {
      target = sections.find((s) => room(s.id) >= g.length)?.id;
    } else if (contiguous) {
      target = sections.find((s) => room(s.id) >= g.length && (load.get(s.id) ?? 0) + g.length <= (quota.get(s.id) ?? 0))?.id
        ?? sections.find((s) => room(s.id) >= g.length)?.id;
    } else {
      target = [...sections]
        .filter((s) => room(s.id) >= g.length)
        .sort((a, b) => (load.get(a.id)! / a.capacity) - (load.get(b.id)! / b.capacity))[0]?.id;
    }
    if (!target) { g.forEach((s) => unplaced.push(s.id)); continue; }
    g.forEach((s) => { assignments[s.id] = target!; });
    load.set(target, (load.get(target) ?? 0) + g.length);
  }
  return { assignments, unplaced };
}
