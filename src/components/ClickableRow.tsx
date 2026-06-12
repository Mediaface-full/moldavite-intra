'use client';

import { useRouter } from 'next/navigation';
import React from 'react';

/**
 * Klikatelný řádek tabulky. Klik na buňku navigates na `href`,
 * pokud cíl kliku není interaktivní prvek (a, button, input, select, textarea, label)
 * ani potomek takového prvku.
 *
 * Použij v server components, kde nemůžeme volat useRouter přímo.
 */
interface ClickableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  href: string;
  children: React.ReactNode;
}

export default function ClickableRow({ href, children, className = '', ...rest }: ClickableRowProps) {
  const router = useRouter();

  function handleClick(e: React.MouseEvent<HTMLTableRowElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('a, button, input, select, textarea, label, [data-no-row-click]')) {
      return; // editovatelný prvek — necháme původní akci proběhnout
    }
    router.push(href);
  }

  return (
    <tr
      {...rest}
      onClick={handleClick}
      className={`cursor-pointer ${className}`}
    >
      {children}
    </tr>
  );
}
