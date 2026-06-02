'use client';

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  forwardRef,
  useId,
} from 'react';
import styles from './DropdownMenu.module.css';

/* ─── Types ──────────────────────────────────── */
type ItemVariant = 'default' | 'destructive';

interface DropdownContextValue {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  triggerId: string;
  contentId: string;
}

interface DropdownMenuProps {
  children: React.ReactNode;
  className?: string;
}

interface TriggerProps {
  children: React.ReactNode;
  className?: string;
}

interface ContentProps {
  children: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}

interface ItemProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: ItemVariant;
  disabled?: boolean;
  icon?: React.ReactNode;
}

interface SeparatorProps {
  className?: string;
}

interface LabelProps {
  children: React.ReactNode;
  className?: string;
}

/* ─── Context ────────────────────────────────── */
const DropdownContext = createContext<DropdownContextValue | null>(null);
const useDropdownContext = () => {
  const ctx = useContext(DropdownContext);
  if (!ctx) throw new Error('DropdownMenu compound components must be used within <DropdownMenu>');
  return ctx;
};

/* ─── Root ───────────────────────────────────── */
const DropdownMenuRoot = forwardRef<HTMLDivElement, DropdownMenuProps>(
  ({ children, className }, ref) => {
    const [isOpen, setIsOpen] = useState(false);
    const baseId = useId();
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Click outside to close
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Escape to close
    useEffect(() => {
      if (!isOpen) return;

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setIsOpen(false);
        }
      };

      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    return (
      <DropdownContext.Provider
        value={{
          isOpen,
          setIsOpen,
          triggerId: `${baseId}-trigger`,
          contentId: `${baseId}-content`,
        }}
      >
        <div
          ref={(node) => {
            (wrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          className={[styles.wrapper, className].filter(Boolean).join(' ')}
        >
          {children}
        </div>
      </DropdownContext.Provider>
    );
  }
);
DropdownMenuRoot.displayName = 'DropdownMenu';

/* ─── Trigger ────────────────────────────────── */
const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(
  ({ children, className }, ref) => {
    const { isOpen, setIsOpen, triggerId, contentId } = useDropdownContext();

    return (
      <button
        ref={ref}
        className={[styles.trigger, className].filter(Boolean).join(' ')}
        id={triggerId}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? contentId : undefined}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {children}
      </button>
    );
  }
);
Trigger.displayName = 'DropdownMenu.Trigger';

/* ─── Content ────────────────────────────────── */
const Content = forwardRef<HTMLDivElement, ContentProps>(
  ({ children, className, align = 'left' }, ref) => {
    const { isOpen, setIsOpen, contentId, triggerId } = useDropdownContext();
    const internalRef = useRef<HTMLDivElement>(null);

    // Auto-focus first item on open
    useEffect(() => {
      if (isOpen && internalRef.current) {
        const firstItem = internalRef.current.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
        if (firstItem) {
          // Slight delay to ensure render is complete
          requestAnimationFrame(() => firstItem.focus());
        }
      }
    }, [isOpen]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(
          (e.currentTarget as HTMLDivElement).querySelectorAll<HTMLElement>(
            '[role="menuitem"]:not([aria-disabled="true"])'
          )
        );
        const currentIndex = items.findIndex((item) => item === document.activeElement);

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const nextIndex = (currentIndex + 1) % items.length;
          items[nextIndex]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prevIndex = (currentIndex - 1 + items.length) % items.length;
          items[prevIndex]?.focus();
        } else if (e.key === 'Home') {
          e.preventDefault();
          items[0]?.focus();
        } else if (e.key === 'End') {
          e.preventDefault();
          items[items.length - 1]?.focus();
        } else if (e.key === 'Tab') {
          setIsOpen(false);
        }
      },
      [setIsOpen]
    );

    if (!isOpen) return null;

    const classNames = [
      styles.content,
      align === 'right' ? styles.contentAlignRight : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={(node) => {
          (internalRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={classNames}
        id={contentId}
        role="menu"
        aria-labelledby={triggerId}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    );
  }
);
Content.displayName = 'DropdownMenu.Content';

/* ─── Item ───────────────────────────────────── */
const Item = forwardRef<HTMLButtonElement, ItemProps>(
  ({ children, className, onClick, variant = 'default', disabled = false, icon }, ref) => {
    const { setIsOpen } = useDropdownContext();

    const handleClick = () => {
      if (disabled) return;
      onClick?.();
      setIsOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    };

    const classNames = [
      styles.item,
      variant === 'destructive' ? styles.itemDestructive : '',
      disabled ? styles.itemDisabled : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classNames}
        role="menuitem"
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        type="button"
      >
        {icon && <span className={styles.itemIcon}>{icon}</span>}
        {children}
      </button>
    );
  }
);
Item.displayName = 'DropdownMenu.Item';

/* ─── Separator ──────────────────────────────── */
const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className }, ref) => (
    <div
      ref={ref}
      className={[styles.separator, className].filter(Boolean).join(' ')}
      role="separator"
    />
  )
);
Separator.displayName = 'DropdownMenu.Separator';

/* ─── Label ──────────────────────────────────── */
const Label = forwardRef<HTMLDivElement, LabelProps>(
  ({ children, className }, ref) => (
    <div
      ref={ref}
      className={[styles.label, className].filter(Boolean).join(' ')}
      role="group"
    >
      {children}
    </div>
  )
);
Label.displayName = 'DropdownMenu.Label';

/* ─── Compound Export ────────────────────────── */
export const DropdownMenu = Object.assign(DropdownMenuRoot, {
  Trigger,
  Content,
  Item,
  Separator,
  Label,
});

export type {
  DropdownMenuProps,
  TriggerProps as DropdownMenuTriggerProps,
  ContentProps as DropdownMenuContentProps,
  ItemProps as DropdownMenuItemProps,
  SeparatorProps as DropdownMenuSeparatorProps,
  LabelProps as DropdownMenuLabelProps,
};
