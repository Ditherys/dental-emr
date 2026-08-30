import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const sourcePath = resolve(
  repositoryRoot,
  "vendor/react-advanced-odontogram/dist/style.css",
);
const outputPath = resolve(
  repositoryRoot,
  "vendor/react-advanced-odontogram/dist/emr-style.css",
);

const hostClass = "dental-emr-fork";

function isKeyframesRule(rule) {
  let parent = rule.parent;
  while (parent?.type === "atrule") {
    if (parent.name.toLowerCase().endsWith("keyframes")) return true;
    parent = parent.parent;
  }
  return false;
}

function scopeSelectors(selectorText) {
  return selectorParser((selectors) => {
    selectors.each((selector) => {
      const trimmed = selector.toString().trim();

      // Keyframe steps are visited by PostCSS as rules, but are not CSS
      // selectors and must not receive a host prefix.
      if (/^(?:from|to|(?:\d+(?:\.\d+)?%)(?:\s*,\s*(?:\d+(?:\.\d+)?%|from|to))*)$/i.test(trimmed)) {
        return;
      }

      if (trimmed === ":root" || trimmed === "html" || trimmed === "body" || trimmed === "html body") {
        selector.removeAll();
        selector.append(selectorParser.className({ value: hostClass }));
        return;
      }

      const firstNode = selector.nodes[0];
      if (firstNode?.type === "class" && firstNode.value === "dark") {
        selector.nodes.splice(
          1,
          0,
          selectorParser.combinator({ value: " " }),
          selectorParser.className({ value: hostClass }),
        );
        return;
      }

      selector.nodes.unshift(
        selectorParser.className({ value: hostClass }),
        selectorParser.combinator({ value: " " }),
      );
    });
  }).processSync(selectorText);
}

const source = readFileSync(sourcePath, "utf8");
const root = postcss.parse(source, { from: sourcePath });
root.walkRules((rule) => {
  if (!isKeyframesRule(rule)) rule.selector = scopeSelectors(rule.selector);
});

writeFileSync(outputPath, root.toString(), "utf8");
