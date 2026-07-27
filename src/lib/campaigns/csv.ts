import { normalizePhoneInput } from "@/lib/utils";

/**
 * Parser de CSV de destinatários: primeira coluna = telefone, demais colunas
 * = variáveis nomeadas (nome da coluna = nome da variável). Suporte simples
 * a células entre aspas com vírgula — suficiente para o caso de uso (sem
 * dependência nova).
 */

export type CsvRecipientRow = {
  phone: string;
  /** Por nome de coluna (canal não oficial: {{variavel}} nomeada). */
  variables: Record<string, string>;
  /** Na ordem das colunas, sem o telefone (canal oficial: primeiro valor = {{1}}). */
  variablesOrdered: string[];
};

export type InvalidCsvRow = { line: number; reason: string };

export type ParsedRecipientsCsv = {
  validRows: CsvRecipientRow[];
  invalidRows: InvalidCsvRow[];
  variableNames: string[];
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

export function parseRecipientsCsv(csvText: string): ParsedRecipientsCsv {
  const lines = csvText.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { validRows: [], invalidRows: [], variableNames: [] };
  }

  const headers = splitCsvLine(lines[0]!);
  const variableNames = headers.slice(1).filter(Boolean);
  const validRows: CsvRecipientRow[] = [];
  const invalidRows: InvalidCsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]!);
    const rawPhone = cells[0] ?? "";
    const phone = normalizePhoneInput(rawPhone);
    if (!phone) {
      invalidRows.push({
        line: i + 1,
        reason: `Telefone inválido: "${rawPhone}"`,
      });
      continue;
    }
    const variables: Record<string, string> = {};
    const variablesOrdered: string[] = [];
    headers.slice(1).forEach((header, idx) => {
      const value = cells[idx + 1] ?? "";
      if (header) variables[header] = value;
      variablesOrdered.push(value);
    });
    validRows.push({ phone, variables, variablesOrdered });
  }

  return { validRows, invalidRows, variableNames };
}
