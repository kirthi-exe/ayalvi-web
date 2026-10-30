import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { WaitlistForm } from "@/components/waitlist/form";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(dir, entry.name))
      : [join(dir, entry.name)],
  );
it("public source contains no matrimonial or matrimony wording", () => {
  const sources = [
    ...files("app").filter((path) => !path.split(/[\\/]/).includes("admin")),
    ...files("components").filter(
      (path) =>
        !path
          .split(/[\\/]/)
          .some((part) => ["admin", "reviewer"].includes(part)),
    ),
    ...files("lib/constants"),
    ...files("lib/validation"),
    ...files("lib/referrals"),
    ...files("public"),
  ].filter((path) => /\.(tsx?|jsx?|json|html|svg|txt|md)$/.test(path));
  const matches = sources.filter((path) =>
    /matrimonial|matrimony/i.test(readFileSync(path, "utf8")),
  );
  expect(matches).toEqual([]);
});
it("public prose, metadata and visible attributes contain no dash punctuation", () => {
  const sources = [
    ...files("app").filter((path) => !path.split(/[\\/]/).includes("admin")),
    ...files("components/layout"),
    ...files("components/landing"),
    ...files("components/waitlist"),
    ...files("components/referrals"),
    "lib/constants/site.ts",
    "lib/validation/waitlist.ts",
  ].filter((path) => /\.tsx?$/.test(path));
  const violations: string[] = [];
  for (const path of sources) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      path.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      let text = "";
      if (ts.isJsxText(node)) text = node.text;
      if (
        ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        const parent = node.parent;
        if (ts.isJsxAttribute(parent)) {
          if (
            ["placeholder", "title", "alt", "aria-label"].includes(
              parent.name.getText(source),
            )
          )
            text = node.text;
        } else if (
          !ts.isImportDeclaration(parent) &&
          /\s|[–—]/.test(node.text)
        ) {
          // Prose strings include metadata and error messages. Single-token
          // identifiers, stored enum values, URLs and CSS selectors are not copy.
          text = node.text;
        }
      }
      if (/[-–—]/.test(text)) violations.push(`${path}: ${text.trim()}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(violations).toEqual([]);
});
it("renders dash-free gender labels without changing submitted enum values", () => {
  render(<WaitlistForm />);
  const select = screen.getByLabelText("Gender", { exact: true });
  const options = within(select).getAllByRole("option");
  for (const option of options) expect(option.textContent).not.toMatch(/[-–—]/);
  expect(
    within(select).getByRole("option", { name: "Nonbinary" }),
  ).toHaveAttribute("value", "Non-binary");
});
