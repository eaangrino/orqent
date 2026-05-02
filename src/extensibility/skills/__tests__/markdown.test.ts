import { describe, expect, it } from "vitest";
import { parseSkillMarkdown } from "../index.js";

describe("parseSkillMarkdown", () => {
  it("parsea una skill markdown con frontmatter y cuerpo como instructions", () => {
    const skill = parseSkillMarkdown(`---
identifier: typescript-reviewer
name: TypeScript Reviewer
description: Reviews TypeScript code.
enabled: true
scope: project
manual: true
auto: true
keywords:
  - typescript
  - typecheck
filePatterns:
  - "*.ts"
  - "*.tsx"
toolNames:
  - filesystem.read
---

Review TypeScript code with strict feedback.
`);

    expect(skill).toEqual({
      identifier: "typescript-reviewer",
      name: "TypeScript Reviewer",
      description: "Reviews TypeScript code.",
      enabled: true,
      scope: "project",
      activation: {
        manual: true,
        auto: true,
        keywords: [ "typescript", "typecheck" ],
        filePatterns: [ "*.ts", "*.tsx" ],
        toolNames: [ "filesystem.read" ],
      },
      instructions: "Review TypeScript code with strict feedback.",
    });
  });

  it("usa defaults seguros para enabled, scope, manual y auto", () => {
    const skill = parseSkillMarkdown(`---
identifier: planner
name: Planner
description: Plans work.
---

Create practical plans.
`);

    expect(skill).toMatchObject({
      identifier: "planner",
      enabled: true,
      scope: undefined,
      activation: {
        manual: true,
        auto: false,
        keywords: [],
        filePatterns: [],
        toolNames: [],
      },
    });
  });

  it("devuelve null si falta frontmatter", () => {
    expect(parseSkillMarkdown("Only instructions")).toBeNull();
  });

  it("devuelve null si faltan campos requeridos", () => {
    expect(parseSkillMarkdown(`---
identifier: bad
name: Bad
---

Missing description.
`)).toBeNull();
  });

  it("devuelve null si instructions queda vacío", () => {
    expect(parseSkillMarkdown(`---
identifier: bad
name: Bad
description: Bad skill.
---
`)).toBeNull();
  });
});
