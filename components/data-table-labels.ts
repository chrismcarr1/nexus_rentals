import { Children, Fragment, cloneElement, isValidElement } from "react";

export function nodeText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: React.ReactNode }).children);
  return "";
}

/**
 * Adds data-label attributes (taken from the column headers) to every cell
 * so the phone layout can render each row as a labelled card without any
 * per-page markup changes. Rows may be <tr> elements or components such as
 * ClickableTableRow whose children are the cells.
 */
export function labelRowCells(rows: React.ReactNode, labels: string[]): React.ReactNode {
  return Children.map(rows, (row) => {
    if (!isValidElement(row)) return row;
    if (row.type === Fragment) {
      const fragmentChildren = (row.props as { children?: React.ReactNode }).children;
      return cloneElement(row as React.ReactElement<{ children?: React.ReactNode }>, {
        children: labelRowCells(fragmentChildren, labels)
      });
    }

    const rowChildren = (row.props as { children?: React.ReactNode }).children;
    if (rowChildren === undefined) return row;
    let cellIndex = 0;
    const labelledCells = Children.map(rowChildren, (cell) => {
      if (!isValidElement(cell)) return cell;
      const label = labels[cellIndex];
      cellIndex += 1;
      if (cell.type !== "td" || !label) return cell;
      const cellProps = cell.props as Record<string, unknown>;
      if (cellProps["data-label"] !== undefined) return cell;
      return cloneElement(cell as React.ReactElement<Record<string, unknown>>, { "data-label": label });
    });

    return cloneElement(row as React.ReactElement<{ children?: React.ReactNode }>, { children: labelledCells });
  });
}
