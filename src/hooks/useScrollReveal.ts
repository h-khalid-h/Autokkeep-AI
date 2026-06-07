'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * useScrollReveal — Intersection Observer hook for scroll-triggered animations.
 * 
 * Adds the `revealed` class to elements with `[data-scroll-reveal]` 
 * when they enter the viewport, triggering CSS transitions defined 
 * in animations.css.
 * 
 * @param options - IntersectionObserver options
 * @param options.threshold - Visibility threshold (default: 0.15 = 15% visible)
 * @param options.rootMargin - Root margin (default: "0px 0px -60px 0px" — triggers slightly before fully in view)
 * @param options.once - Whether to only reveal once (default: true)
 */
export function useScrollReveal(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const containerRef = useRef<HTMLElement>(null);

  const {
    threshold = 0.15,
    rootMargin = '0px 0px -60px 0px',
    once = true,
  } = options ?? {};

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Respect reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      // Immediately reveal all elements
      container.querySelectorAll('[data-scroll-reveal]').forEach((el) => {
        el.classList.add('revealed');
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            if (once) {
              observer.unobserve(entry.target);
            }
          } else if (!once) {
            entry.target.classList.remove('revealed');
          }
        });
      },
      { threshold, rootMargin }
    );

    const elements = container.querySelectorAll('[data-scroll-reveal]');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return containerRef;
}

/**
 * useStaggerReveal — Creates stagger delay for child elements.
 * Call this on a parent element, and it will auto-assign data-stagger 
 * attributes to direct children matching the selector.
 */
export function useStaggerReveal(
  selector: string = ':scope > *',
  options?: { threshold?: number; rootMargin?: string }
) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const children = container.querySelectorAll(selector);
    children.forEach((child, index) => {
      child.setAttribute('data-stagger', String(index + 1));
    });
  }, [selector]);

  return ref;
}
