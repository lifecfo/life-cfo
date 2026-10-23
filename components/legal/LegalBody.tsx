import Link from "next/link";

type ListItem = { text: string; children: string[] };

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: ListItem[] }
  | { type: "table"; headers: string[]; rows: string[][] };

const LINKS: { phrase: string; href: string }[] = [
  { phrase: '"Before you start"', href: "/fine-print" },
  { phrase: "Privacy Policy", href: "/privacy" },
];

function isTableSeparator(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseLegalBody(body: string): Block[] {
  const lines = body.split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      const content = tableLines.filter((row) => !isTableSeparator(row));
      const [header, ...rows] = content.map(splitTableRow);
      if (header?.length) blocks.push({ type: "table", headers: header, rows });
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("  - ")) {
      const items: ListItem[] = [];
      while (index < lines.length && (lines[index].startsWith("- ") || lines[index].startsWith("  - "))) {
        if (lines[index].startsWith("  - ") && items.length > 0) {
          items[items.length - 1].children.push(lines[index].slice(4));
        } else if (lines[index].startsWith("- ")) {
          items.push({ text: lines[index].slice(2), children: [] });
        }
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trimStart().startsWith("|") &&
      !lines[index].startsWith("- ") &&
      !lines[index].startsWith("  - ")
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }

  return blocks;
}

function Inline({ text }: { text: string }) {
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {boldParts.map((part, partIndex) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={partIndex} className="font-semibold text-zinc-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <Plain key={partIndex} text={part} />;
      })}
    </>
  );
}

function Plain({ text }: { text: string }) {
  const pattern = new RegExp(`(${LINKS.map((link) => link.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, partIndex) => {
        const link = LINKS.find((item) => item.phrase === part);
        if (!link) return <span key={partIndex}>{part}</span>;
        return (
          <Link key={partIndex} href={link.href} className="font-medium text-zinc-900 underline underline-offset-2">
            {part}
          </Link>
        );
      })}
    </>
  );
}

function ItemList({ items }: { items: ListItem[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item.text}>
          <Inline text={item.text} />
          {item.children.length > 0 ? (
            <ul className="mt-1 list-[circle] space-y-1 pl-5">
              {item.children.map((child) => (
                <li key={child}>
                  <Inline text={child} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function LegalTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((row, rowIndex) => (
          <dl key={rowIndex} className="space-y-2 rounded-xl border border-zinc-200 p-3">
            {headers.map((header, cellIndex) => (
              <div key={header}>
                <dt className="text-xs font-medium text-zinc-500">{header}</dt>
                <dd className="text-zinc-800">
                  <Inline text={row[cellIndex] ?? ""} />
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200">
              {headers.map((header) => (
                <th key={header} className="px-2 py-2 font-semibold text-zinc-900">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-zinc-100 align-top">
                {headers.map((header, cellIndex) => (
                  <td key={header} className="px-2 py-2 text-zinc-700">
                    <Inline text={row[cellIndex] ?? ""} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function LegalBody({ body, className }: { body: string; className?: string }) {
  const blocks = parseLegalBody(body);
  return (
    <div className={className ?? "space-y-3 text-sm leading-6 text-zinc-700"}>
      {blocks.map((block, blockIndex) => {
        if (block.type === "p") {
          return (
            <p key={blockIndex}>
              <Inline text={block.text} />
            </p>
          );
        }
        if (block.type === "ul") return <ItemList key={blockIndex} items={block.items} />;
        return <LegalTable key={blockIndex} headers={block.headers} rows={block.rows} />;
      })}
    </div>
  );
}
