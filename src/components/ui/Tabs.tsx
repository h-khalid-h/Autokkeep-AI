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
import styles from './Tabs.module.css';

/* ─── Types ──────────────────────────────────── */
type TabsVariant = 'underline' | 'pills';

interface TabsContextValue {
  activeValue: string;
  setActiveValue: (value: string) => void;
  variant: TabsVariant;
  baseId: string;
  registerTab: (value: string, element: HTMLButtonElement) => void;
  unregisterTab: (value: string) => void;
  getTabElement: (value: string) => HTMLButtonElement | undefined;
}

interface TabsProps {
  children: React.ReactNode;
  className?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  variant?: TabsVariant;
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

interface TabsTabProps {
  children: React.ReactNode;
  className?: string;
  value: string;
  disabled?: boolean;
}

interface TabsPanelProps {
  children: React.ReactNode;
  className?: string;
  value: string;
}

/* ─── Context ────────────────────────────────── */
const TabsContext = createContext<TabsContextValue | null>(null);
const useTabsContext = () => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error('Tabs compound components must be used within <Tabs>');
  return ctx;
};

/* ─── Tabs Root ──────────────────────────────── */
const TabsRoot = forwardRef<HTMLDivElement, TabsProps>(
  ({ children, className, defaultValue = '', value, onChange, variant = 'underline' }, ref) => {
    const [internalValue, setInternalValue] = useState(defaultValue);
    const activeValue = value !== undefined ? value : internalValue;
    const baseId = useId();
    const tabElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

    const setActiveValue = useCallback(
      (val: string) => {
        if (value === undefined) {
          setInternalValue(val);
        }
        onChange?.(val);
      },
      [value, onChange]
    );

    const registerTab = useCallback((val: string, element: HTMLButtonElement) => {
      tabElementsRef.current.set(val, element);
    }, []);

    const unregisterTab = useCallback((val: string) => {
      tabElementsRef.current.delete(val);
    }, []);

    const getTabElement = useCallback((val: string) => {
      return tabElementsRef.current.get(val);
    }, []);

    return (
      <TabsContext.Provider
        value={{
          activeValue,
          setActiveValue,
          variant,
          baseId,
          registerTab,
          unregisterTab,
          getTabElement,
        }}
      >
        <div ref={ref} className={[styles.tabs, className].filter(Boolean).join(' ')}>
          {children}
        </div>
      </TabsContext.Provider>
    );
  }
);
TabsRoot.displayName = 'Tabs';

/* ─── Tab List ───────────────────────────────── */
const List = forwardRef<HTMLDivElement, TabsListProps>(
  ({ children, className }, ref) => {
    const { variant, activeValue, getTabElement } = useTabsContext();
    const listRef = useRef<HTMLDivElement>(null);
    const indicatorRef = useRef<HTMLDivElement>(null);

    // Animated underline indicator
    useEffect(() => {
      if (variant !== 'underline' || !listRef.current || !indicatorRef.current) return;

      const activeTab = getTabElement(activeValue);
      if (activeTab && listRef.current.contains(activeTab)) {
        const listRect = listRef.current.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        indicatorRef.current.style.left = `${tabRect.left - listRect.left}px`;
        indicatorRef.current.style.width = `${tabRect.width}px`;
      }
    }, [activeValue, variant, getTabElement]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const tabs = Array.from(
        (e.currentTarget as HTMLDivElement).querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
      );
      const currentIndex = tabs.findIndex((t) => t === document.activeElement);

      let nextIndex: number | null = null;
      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = tabs.length - 1;
      }

      if (nextIndex !== null) {
        e.preventDefault();
        tabs[nextIndex].focus();
      }
    };

    const listClassNames = [
      styles.list,
      variant === 'underline' ? styles.listUnderline : '',
      variant === 'pills' ? styles.listPills : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={(node) => {
          (listRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={listClassNames}
        role="tablist"
        onKeyDown={handleKeyDown}
      >
        {children}
        {variant === 'underline' && (
          <div ref={indicatorRef} className={styles.indicator} aria-hidden="true" />
        )}
      </div>
    );
  }
);
List.displayName = 'Tabs.List';

/* ─── Tab Button ─────────────────────────────── */
const Tab = forwardRef<HTMLButtonElement, TabsTabProps>(
  ({ children, className, value, disabled = false }, ref) => {
    const { activeValue, setActiveValue, variant, baseId, registerTab, unregisterTab } = useTabsContext();
    const isActive = activeValue === value;
    const internalRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
      const el = internalRef.current;
      if (el) registerTab(value, el);
      return () => unregisterTab(value);
    }, [value, registerTab, unregisterTab]);

    const classNames = [
      styles.tab,
      variant === 'underline' ? styles.tabUnderline : '',
      variant === 'pills' ? styles.tabPills : '',
      isActive ? styles.tabActive : '',
      disabled ? styles.tabDisabled : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={(node) => {
          (internalRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
        }}
        className={classNames}
        role="tab"
        id={`${baseId}-tab-${value}`}
        aria-selected={isActive}
        aria-controls={`${baseId}-panel-${value}`}
        tabIndex={isActive ? 0 : -1}
        disabled={disabled}
        onClick={() => {
          if (!disabled) setActiveValue(value);
        }}
      >
        {children}
      </button>
    );
  }
);
Tab.displayName = 'Tabs.Tab';

/* ─── Tab Panel ──────────────────────────────── */
const Panel = forwardRef<HTMLDivElement, TabsPanelProps>(
  ({ children, className, value }, ref) => {
    const { activeValue, baseId } = useTabsContext();
    const isActive = activeValue === value;

    return (
      <div
        ref={ref}
        className={[
          styles.panel,
          !isActive ? styles.panelHidden : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        role="tabpanel"
        id={`${baseId}-panel-${value}`}
        aria-labelledby={`${baseId}-tab-${value}`}
        tabIndex={0}
        hidden={!isActive}
      >
        {isActive && children}
      </div>
    );
  }
);
Panel.displayName = 'Tabs.Panel';

/* ─── Compound Export ────────────────────────── */
export const Tabs = Object.assign(TabsRoot, {
  List,
  Tab,
  Panel,
});

export type { TabsProps, TabsListProps, TabsTabProps, TabsPanelProps, TabsVariant };
