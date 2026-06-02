'use client';

import React, { createContext, useContext, forwardRef } from 'react';
import styles from './Table.module.css';

/* ─── Types ──────────────────────────────────── */
type SortDirection = 'asc' | 'desc' | 'none';
type MobileLayout = 'default' | 'cards';

interface TableContextValue {
  sortColumn?: string;
  sortDirection?: SortDirection;
  onSort?: (column: string) => void;
  sortable?: boolean;
  mobileLayout?: MobileLayout;
  striped?: boolean;
}

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
  className?: string;
  sortable?: boolean;
  sortColumn?: string;
  sortDirection?: SortDirection;
  onSort?: (column: string) => void;
  mobileLayout?: MobileLayout;
  striped?: boolean;
}

interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
  className?: string;
}

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
  className?: string;
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
}

interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  className?: string;
  column?: string;
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  className?: string;
  label?: string;
}

/* ─── Context ────────────────────────────────── */
const TableContext = createContext<TableContextValue>({});
const useTableContext = () => useContext(TableContext);

/* ─── Table Root ─────────────────────────────── */
const TableRoot = forwardRef<HTMLTableElement, TableProps>(
  (
    {
      children,
      className,
      sortable = false,
      sortColumn,
      sortDirection = 'none',
      onSort,
      mobileLayout = 'default',
      striped = false,
      ...props
    },
    ref
  ) => {
    const contextValue: TableContextValue = {
      sortColumn,
      sortDirection,
      onSort,
      sortable,
      mobileLayout,
      striped,
    };

    const classNames = [
      styles.table,
      striped ? styles.striped : '',
      mobileLayout === 'cards' ? styles.mobileCards : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <TableContext.Provider value={contextValue}>
        <div className={styles.wrapper}>
          <table ref={ref} className={classNames} role="table" {...props}>
            {children}
          </table>
        </div>
      </TableContext.Provider>
    );
  }
);
TableRoot.displayName = 'Table';

/* ─── Header ─────────────────────────────────── */
const Header = forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ children, className, ...props }, ref) => (
    <thead
      ref={ref}
      className={[styles.header, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </thead>
  )
);
Header.displayName = 'Table.Header';

/* ─── Body ───────────────────────────────────── */
const Body = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ children, className, ...props }, ref) => (
    <tbody
      ref={ref}
      className={[styles.body, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </tbody>
  )
);
Body.displayName = 'Table.Body';

/* ─── Row ────────────────────────────────────── */
const Row = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ children, className, selected = false, ...props }, ref) => {
    const classNames = [
      styles.row,
      selected ? styles.rowSelected : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <tr ref={ref} className={classNames} aria-selected={selected || undefined} {...props}>
        {children}
      </tr>
    );
  }
);
Row.displayName = 'Table.Row';

/* ─── HeaderCell ─────────────────────────────── */
const HeaderCell = forwardRef<HTMLTableCellElement, TableHeaderCellProps>(
  ({ children, className, column, ...props }, ref) => {
    const { sortable, sortColumn, sortDirection, onSort } = useTableContext();
    const isSortable = sortable && column;
    const isActiveSort = column === sortColumn;

    const handleClick = () => {
      if (isSortable && onSort && column) {
        onSort(column);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (isSortable && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleClick();
      }
    };

    const ariaSortValue = isActiveSort
      ? sortDirection === 'asc'
        ? 'ascending'
        : sortDirection === 'desc'
          ? 'descending'
          : 'none'
      : undefined;

    const classNames = [
      styles.headerCell,
      isSortable ? styles.headerCellSortable : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <th
        ref={ref}
        className={classNames}
        onClick={isSortable ? handleClick : undefined}
        onKeyDown={isSortable ? handleKeyDown : undefined}
        tabIndex={isSortable ? 0 : undefined}
        role={isSortable ? 'columnheader' : undefined}
        aria-sort={ariaSortValue}
        {...props}
      >
        <span className={styles.headerCellContent}>
          {children}
          {isSortable && (
            <span
              className={[
                styles.sortIndicator,
                isActiveSort ? styles.sortIndicatorActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              <span
                className={
                  isActiveSort && sortDirection === 'asc'
                    ? styles.sortArrowActive
                    : styles.sortArrowInactive
                }
              >
                ▲
              </span>
              <span
                className={
                  isActiveSort && sortDirection === 'desc'
                    ? styles.sortArrowActive
                    : styles.sortArrowInactive
                }
              >
                ▼
              </span>
            </span>
          )}
        </span>
      </th>
    );
  }
);
HeaderCell.displayName = 'Table.HeaderCell';

/* ─── Cell ───────────────────────────────────── */
const Cell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ children, className, label, ...props }, ref) => (
    <td
      ref={ref}
      className={[styles.cell, className].filter(Boolean).join(' ')}
      data-label={label}
      {...props}
    >
      {children}
    </td>
  )
);
Cell.displayName = 'Table.Cell';

/* ─── Compound Export ────────────────────────── */
export const Table = Object.assign(TableRoot, {
  Header,
  Body,
  Row,
  HeaderCell,
  Cell,
});

export type {
  TableProps,
  TableHeaderProps,
  TableBodyProps,
  TableRowProps,
  TableHeaderCellProps,
  TableCellProps,
  SortDirection,
  MobileLayout,
};
