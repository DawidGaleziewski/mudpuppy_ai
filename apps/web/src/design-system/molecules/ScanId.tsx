import { useEffect, useState } from 'react';
import { Tag } from '../atoms/Tag.js';

/**
 * A scan id as people read it (D-9, design answer Q6): the first two groups of the UUIDv7, which
 * are the scan's start time in milliseconds (`01a110d5-2028`); when another id in the same list
 * starts the same, one more group at a time until it differs (UUIDv7's counter makes the third
 * group differ for two scans of the same millisecond). An id that is not a UUID is shown as it is.
 */
export function shortScanId(id: string, siblings: readonly string[] = []): string {
  const g = id.split('-');
  if (g.length !== 5) return id;
  const others = siblings.filter((o) => o !== id);
  for (let n = 2; n < 5; n++) {
    const short = g.slice(0, n).join('-');
    if (!others.some((o) => o.startsWith(`${short}-`))) return short;
  }
  return id;
}

export interface ScanIdProps {
  /** The full scan id: links, copies and the title use it. */
  id: string;
  /** The other scan ids in the same list, so two that share the short form both show more. */
  siblings?: readonly string[];
  /** Where the scan lives: the id is a manila tag that links there. */
  href?: string;
  /** A manila tag without a link (an id shown as data beside facts). */
  tag?: boolean;
  /** A Copy button beside it, where the id is a fact people act on (a scan's header, a scan row). */
  copy?: boolean;
  /** The whole id written out, wrapping anywhere: the scan's own page only. */
  full?: boolean;
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = () => {
    void navigator.clipboard.writeText(id).then(() => setCopied(true));
  };
  return (
    <>
      <button className="sy-id__copy" type="button" aria-label={`Copy the full scan id ${id}`} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="sy-sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </>
  );
}

interface ShownProps {
  id: string;
  siblings: readonly string[] | undefined;
  href: string | undefined;
  tag: boolean;
  full: boolean;
}

function Shown({ id, siblings, href, tag, full }: ShownProps) {
  if (full) return <span className="sy-id sy-id--full">{id}</span>;
  const short = shortScanId(id, siblings);
  if (href === undefined && !tag)
    return (
      <span className="sy-id" title={id}>
        {short}
      </span>
    );
  return (
    <Tag size="sm" title={id} {...(href !== undefined ? { href } : {})}>
      {short}
    </Tag>
  );
}

/**
 * A scan id (D-9, design answer Q6): the 13-character short form on screen with the full id on
 * hover, a manila `Tag` when it links or stands as data, the full id written out on the scan's
 * own page, and Copy where people act on it. Data, links and exports always keep the full id.
 */
export function ScanId({ id, siblings, href, tag = false, copy = false, full = false }: ScanIdProps) {
  const shown = <Shown id={id} {...{ siblings, href, tag, full }} />;
  return copy ? (
    <span>
      {shown}
      <CopyId id={id} />
    </span>
  ) : (
    shown
  );
}
